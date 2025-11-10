/**
 * Mobile Territory Controller (Refactored)
 * Handles agency territory management using agencies.territories JSONB field
 * Date: 2025-11-10
 */

const supabase = require('../config/supabaseClient');
const crypto = require('crypto');

/**
 * GET /api/mobile/territories
 * Get agency's current territories from agencies.territories JSONB
 */
exports.getAgencyTerritories = async (req, res) => {
  try {
    const agencyId = req.agency.id;
    const { isActive, type, state, search } = req.query;

    // Fetch agency with territories
    const { data: agency, error } = await supabase
      .from('agencies')
      .select('id, territories, territory_count, territory_limit, primary_zipcodes, primary_cities')
      .eq('id', agencyId)
      .single();

    if (error) throw error;
    if (!agency) {
      return res.status(404).json({
        success: false,
        message: 'Agency not found'
      });
    }

    let territories = agency.territories || [];

    // Apply filters
    if (isActive !== undefined) {
      const activeFilter = isActive === 'true';
      territories = territories.filter(t => 
        t.is_active === activeFilter && !t.deleted_at
      );
    } else {
      // Default: only return active, non-deleted
      territories = territories.filter(t => t.is_active && !t.deleted_at);
    }

    if (type) {
      territories = territories.filter(t => t.type === type);
    }

    if (state) {
      territories = territories.filter(t => t.state === state);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      territories = territories.filter(t => 
        (t.value && t.value.toLowerCase().includes(searchLower)) ||
        (t.city && t.city.toLowerCase().includes(searchLower)) ||
        (t.zipcode && t.zipcode.toLowerCase().includes(searchLower))
      );
    }

    // Sort by priority (descending) then by added_at
    territories.sort((a, b) => {
      if (b.priority !== a.priority) {
        return (b.priority || 0) - (a.priority || 0);
      }
      return new Date(b.added_at || 0) - new Date(a.added_at || 0);
    });

    // Shape response for mobile
    const shaped = territories.map(t => ({
      id: t.id,
      type: t.type,
      value: t.value,
      state: t.state,
      county: t.county || null,
      city: t.city || null,
      zipcode: t.zipcode || null,
      isActive: t.is_active,
      priority: t.priority || 0,
      addedDate: t.added_at,
      lastUpdated: agency.territories_updated_at || t.added_at,
      subscription: t.subscription_id ? {
        id: t.subscription_id
      } : null
    }));

    // Backward-compat: provide top-level zipcodes array
    const zipcodes = agency.primary_zipcodes || [];

    res.status(200).json({
      success: true,
      data: {
        territories: shaped,
        totalCount: shaped.length,
        activeCount: shaped.filter(t => t.isActive).length,
        limit: agency.territory_limit || 0
      },
      zipcodes
    });

  } catch (error) {
    console.error('Error in getAgencyTerritories:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
};

/**
 * POST /api/mobile/territories
 * Add a new territory to agency
 */
exports.addTerritory = async (req, res) => {
  try {
    const agencyId = req.agency.id;
    const { type, value, state, county, city, zipcode, priority, subscription_id } = req.body;

    // Validation
    if (!type || !value) {
      return res.status(400).json({
        success: false,
        message: 'Territory type and value are required'
      });
    }

    if (!['zipcode', 'city', 'county', 'state'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid territory type. Must be: zipcode, city, county, or state'
      });
    }

    // Fetch current agency data
    const { data: agency, error: fetchError } = await supabase
      .from('agencies')
      .select('id, territories, territory_count, territory_limit')
      .eq('id', agencyId)
      .single();

    if (fetchError) throw fetchError;

    const currentTerritories = agency.territories || [];

    // Check if territory already exists
    const exists = currentTerritories.some(t => 
      t.type === type && 
      t.value === value && 
      t.is_active && 
      !t.deleted_at
    );

    if (exists) {
      return res.status(409).json({
        success: false,
        message: 'Territory already exists'
      });
    }

    // Check territory limit
    const activeCount = currentTerritories.filter(t => t.is_active && !t.deleted_at).length;
    if (agency.territory_limit > 0 && activeCount >= agency.territory_limit) {
      return res.status(403).json({
        success: false,
        message: `Territory limit reached. Maximum: ${agency.territory_limit}`
      });
    }

    // Create new territory object
    const newTerritory = {
      id: crypto.randomUUID(),
      type,
      value,
      state: state || null,
      county: county || null,
      city: city || null,
      zipcode: zipcode || (type === 'zipcode' ? value : null),
      is_active: true,
      priority: priority || 0,
      subscription_id: subscription_id || null,
      added_at: new Date().toISOString(),
      metadata: {}
    };

    // Add to territories array
    const updatedTerritories = [...currentTerritories, newTerritory];

    // Update agency
    const { data: updated, error: updateError } = await supabase
      .from('agencies')
      .update({ territories: updatedTerritories })
      .eq('id', agencyId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Log audit event
    await logAuditEvent(req, {
      action: 'ADD_TERRITORY',
      resourceId: newTerritory.id,
      metadata: { type, value, state }
    });

    res.status(201).json({
      success: true,
      message: 'Territory added successfully',
      data: {
        id: newTerritory.id,
        type: newTerritory.type,
        value: newTerritory.value,
        state: newTerritory.state,
        county: newTerritory.county,
        city: newTerritory.city,
        zipcode: newTerritory.zipcode,
        isActive: newTerritory.is_active,
        priority: newTerritory.priority,
        addedDate: newTerritory.added_at
      }
    });

  } catch (error) {
    console.error('Error in addTerritory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add territory',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
};

/**
 * PUT /api/mobile/territories/:id
 * Update a territory (priority, status, etc.)
 */
exports.updateTerritory = async (req, res) => {
  try {
    const agencyId = req.agency.id;
    const territoryId = req.params.id;
    const { priority, is_active, metadata } = req.body;

    // Fetch current agency data
    const { data: agency, error: fetchError } = await supabase
      .from('agencies')
      .select('id, territories')
      .eq('id', agencyId)
      .single();

    if (fetchError) throw fetchError;

    let territories = agency.territories || [];
    const territoryIndex = territories.findIndex(t => t.id === territoryId);

    if (territoryIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Territory not found'
      });
    }

    // Update territory
    if (priority !== undefined) {
      territories[territoryIndex].priority = priority;
    }
    if (is_active !== undefined) {
      territories[territoryIndex].is_active = is_active;
    }
    if (metadata) {
      territories[territoryIndex].metadata = {
        ...territories[territoryIndex].metadata,
        ...metadata
      };
    }

    // Update agency
    const { error: updateError } = await supabase
      .from('agencies')
      .update({ territories })
      .eq('id', agencyId);

    if (updateError) throw updateError;

    // Log audit event
    await logAuditEvent(req, {
      action: 'UPDATE_TERRITORY',
      resourceId: territoryId,
      metadata: { priority, is_active }
    });

    res.status(200).json({
      success: true,
      message: 'Territory updated successfully',
      data: territories[territoryIndex]
    });

  } catch (error) {
    console.error('Error in updateTerritory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update territory',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
};

/**
 * DELETE /api/mobile/territories/:id
 * Remove/deactivate a territory
 */
exports.removeTerritory = async (req, res) => {
  try {
    const agencyId = req.agency.id;
    const territoryId = req.params.id;

    // Fetch current agency data
    const { data: agency, error: fetchError } = await supabase
      .from('agencies')
      .select('id, territories')
      .eq('id', agencyId)
      .single();

    if (fetchError) throw fetchError;

    let territories = agency.territories || [];
    const territoryIndex = territories.findIndex(t => t.id === territoryId);

    if (territoryIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Territory not found'
      });
    }

    // Soft delete: mark as inactive and add deleted_at
    territories[territoryIndex].is_active = false;
    territories[territoryIndex].deleted_at = new Date().toISOString();

    // Update agency
    const { error: updateError } = await supabase
      .from('agencies')
      .update({ territories })
      .eq('id', agencyId);

    if (updateError) throw updateError;

    // Log audit event
    await logAuditEvent(req, {
      action: 'REMOVE_TERRITORY',
      resourceId: territoryId,
      metadata: { 
        type: territories[territoryIndex].type,
        value: territories[territoryIndex].value
      }
    });

    res.status(200).json({
      success: true,
      message: 'Territory removed successfully'
    });

  } catch (error) {
    console.error('Error in removeTerritory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove territory',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
};

/**
 * GET /api/mobile/territories/available
 * Get territories available for claiming
 * NOTE: With new structure, "available" means not in any agency's territories
 */
exports.getAvailableTerritories = async (req, res) => {
  try {
    const {
      state,
      type = 'zipcode',
      search,
      page = 1,
      limit = 50
    } = req.query;

    const currentPage = Math.max(Number.parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 200);
    const offset = (currentPage - 1) * pageSize;

    // Fetch all agencies with territories to find what's claimed
    const { data: agencies, error } = await supabase
      .from('agencies')
      .select('territories');

    if (error) throw error;

    // Extract all claimed territories
    const claimedTerritories = new Set();
    (agencies || []).forEach(agency => {
      const territories = agency.territories || [];
      territories.forEach(t => {
        if (t.is_active && !t.deleted_at) {
          claimedTerritories.add(`${t.type}:${t.value}`);
        }
      });
    });

    // Generate sample available territories (in production, this would query a master territories table)
    const sampleTerritories = generateSampleTerritories(type, state, search);
    
    // Filter out claimed ones
    const available = sampleTerritories.filter(t => 
      !claimedTerritories.has(`${t.type}:${t.value}`)
    );

    // Paginate
    const paged = available.slice(offset, offset + pageSize);
    const totalPages = Math.ceil(available.length / pageSize);

    res.status(200).json({
      success: true,
      data: {
        territories: paged,
        totalCount: available.length,
        page: currentPage,
        limit: pageSize,
        totalPages
      }
    });

  } catch (error) {
    console.error('Error in getAvailableTerritories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch available territories',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
};

/**
 * POST /api/mobile/territories/request
 * Request territory addition (requires admin approval)
 */
exports.requestTerritoryAddition = async (req, res) => {
  try {
    const agencyId = req.agency.id;
    const { type, value, reason } = req.body;

    if (!type || !value) {
      return res.status(400).json({
        success: false,
        message: 'Territory type and value are required'
      });
    }

    // Log the request in notifications or a requests table
    const { error } = await supabase
      .from('notifications')
      .insert([{
        agency_id: agencyId,
        type: 'TERRITORY_REQUEST',
        title: 'Territory Addition Request',
        message: `Request to add ${type}: ${value}`,
        data: { type, value, reason },
        is_read: false,
        created_at: new Date().toISOString()
      }]);

    if (error) throw error;

    // Log audit event
    await logAuditEvent(req, {
      action: 'REQUEST_TERRITORY',
      resourceId: null,
      metadata: { type, value, reason }
    });

    res.status(200).json({
      success: true,
      message: 'Territory request submitted. An admin will review it shortly.'
    });

  } catch (error) {
    console.error('Error in requestTerritoryAddition:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit territory request',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
};

// =====================================================
// HELPER FUNCTIONS
// =====================================================

async function logAuditEvent(req, { action, resourceId, metadata }) {
  try {
    await supabase.from('audit_logs').insert([{
      actor_id: req.agency?.id || 'unknown-agency',
      actor_email: req.agency?.email || null,
      action,
      resource_type: 'TERRITORY',
      resource_id: resourceId,
      metadata: {
        ...(metadata || {}),
        ip: req.ip,
        userAgent: req.get('User-Agent') || null
      },
      created_at: new Date().toISOString()
    }]);
  } catch (auditError) {
    console.warn('Failed to write audit log:', auditError.message);
  }
}

function generateSampleTerritories(type, state, search) {
  // In production, this should query a master territories database
  // For now, generate samples based on Texas zipcodes
  const samples = [];
  
  if (type === 'zipcode') {
    const texasZipcodes = [
      { zipcode: '75201', city: 'Dallas', state: 'TX' },
      { zipcode: '75202', city: 'Dallas', state: 'TX' },
      { zipcode: '75203', city: 'Dallas', state: 'TX' },
      { zipcode: '77001', city: 'Houston', state: 'TX' },
      { zipcode: '77002', city: 'Houston', state: 'TX' },
      { zipcode: '78701', city: 'Austin', state: 'TX' },
      { zipcode: '78702', city: 'Austin', state: 'TX' },
      { zipcode: '78703', city: 'Austin', state: 'TX' },
      { zipcode: '78704', city: 'Austin', state: 'TX' },
      { zipcode: '78705', city: 'Austin', state: 'TX' }
    ];

    texasZipcodes.forEach(z => {
      if (!state || z.state === state) {
        if (!search || z.zipcode.includes(search) || z.city.toLowerCase().includes(search.toLowerCase())) {
          samples.push({
            id: `sample-${z.zipcode}`,
            type: 'zipcode',
            value: z.zipcode,
            zipcode: z.zipcode,
            city: z.city,
            state: z.state,
            county: null,
            is_active: false,
            priority: 0
          });
        }
      }
    });
  } else if (type === 'city') {
    const cities = ['Dallas', 'Houston', 'Austin', 'San Antonio', 'Fort Worth'];
    cities.forEach(city => {
      if (!search || city.toLowerCase().includes(search.toLowerCase())) {
        samples.push({
          id: `sample-city-${city}`,
          type: 'city',
          value: city,
          city,
          state: 'TX',
          county: null,
          zipcode: null,
          is_active: false,
          priority: 0
        });
      }
    });
  }

  return samples;
}

module.exports = exports;
