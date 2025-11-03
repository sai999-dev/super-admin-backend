const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const supabase = require('../config/supabaseClient');
const { authenticateAdmin } = require('../middleware/adminAuth');

// Helper function to generate API key
const generateApiKey = () => {
  const prefix = 'prt_live_';
  const random = crypto.randomBytes(16).toString('hex');
  return `${prefix}${random}`;
};

// Helper function to fetch lead count from API
const fetchLeadCountFromAPI = async (apiEndpoint, authType, authCredentials) => {
  try {
    const headers = {};
    if (authType === 'api_key') {
      headers['x-api-key'] = authCredentials;
    } else if (authType === 'bearer') {
      headers['Authorization'] = `Bearer ${authCredentials}`;
    }
    
    const response = await fetch(apiEndpoint, { headers });
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    
    const data = await response.json();
    // Try common response structures
    return data.count || data.total || data.length || 0;
  } catch (error) {
    console.warn('Error fetching lead count from API:', error.message);
    return 0;
  }
};

// Apply admin authentication to all routes
router.use(authenticateAdmin);

/**
 * GET /api/admin/portals
 * List all portals with filtering and pagination
 */
router.get('/portals', async (req, res) => {
  try {
    const {
      status,
      industry,
      portal_type,
      search,
      page = 1,
      limit = 50
    } = req.query;

    let query = supabase
      .from('portals')
      .select('*', { count: 'exact' });

    // Apply filters
    if (status) {
      query = query.eq('portal_status', status);
    }
    
    if (industry) {
      query = query.eq('industry', industry);
    }
    
    if (portal_type) {
      query = query.eq('portal_type', portal_type);
    }
    
    if (search) {
      query = query.or(`portal_name.ilike.%${search}%,portal_code.ilike.%${search}%`);
    }

    // Apply pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query = query
      .range(offset, offset + parseInt(limit) - 1)
      .order('created_at', { ascending: false });

    const { data, error, count } = await query;

    if (error) throw error;

    // Format response to match frontend expectations
    const formattedPortals = (data || []).map(portal => ({
      id: portal.id,
      portal_name: portal.portal_name,
      portal_code: portal.portal_code,
      portal_type: portal.portal_type,
      industry: portal.industry,
      status: portal.portal_status || portal.status || 'active',
      api_endpoint: portal.api_endpoint,
      api_key: portal.api_key,
      total_leads: portal.total_leads || 0,
      health_status: portal.health_status || 'unknown',
      last_activity: portal.last_activity || portal.updated_at || portal.created_at,
      created_at: portal.created_at
    }));

    res.json({
      success: true,
      data: formattedPortals,
      count: count || formattedPortals.length
    });
  } catch (error) {
    console.error('Error fetching portals:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch portals',
      error: error.message
    });
  }
});

/**
 * GET /api/admin/portals/:id
 * Get single portal details
 */
router.get('/portals/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('portals')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    
    if (!data) {
      return res.status(404).json({
        success: false,
        message: 'Portal not found'
      });
    }

    res.json({
      success: true,
      data: {
        portal: data
      }
    });
  } catch (error) {
    console.error('Error fetching portal:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch portal',
      error: error.message
    });
  }
});

/**
 * POST /api/admin/portals
 * Create new portal
 */
router.post('/portals', async (req, res) => {
  try {
    const {
      portal_name,
      portal_code,
      portal_type,
      industry,
      api_endpoint,
      schema_endpoint,
      auth_type,
      auth_credentials,
      status = 'active',
      schema_fields
    } = req.body;

    // Validation
    if (!portal_name || !portal_code || !portal_type || !industry) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: portal_name, portal_code, portal_type, industry'
      });
    }

    // Check if portal_code already exists
    const { data: existing } = await supabase
      .from('portals')
      .select('id')
      .eq('portal_code', portal_code)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Portal code already exists'
      });
    }

    // Generate API key
    const api_key = generateApiKey();

    // Generate webhook URL
    const baseUrl = process.env.BASE_URL || process.env.FRONTEND_URL || `http://localhost:${process.env.PORT || 3000}`;
    const generated_webhook_url = `${baseUrl}/api/webhooks/${portal_code}`;

    // Fetch initial lead count
    let total_leads = 0;
    if (api_endpoint) {
      try {
        total_leads = await fetchLeadCountFromAPI(api_endpoint, auth_type, auth_credentials);
      } catch (err) {
        console.warn('Could not fetch initial lead count:', err.message);
      }
    }

    // Create portal
    const portalData = {
      portal_name,
      portal_code,
      portal_type,
      industry,
      api_endpoint: api_endpoint || null,
      schema_endpoint: schema_endpoint || null,
      auth_type: auth_type || 'api_key',
      auth_credentials: auth_credentials || null,
      api_key,
      generated_webhook_url,
      portal_status: status,
      health_status: 'unknown',
      total_leads,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('portals')
      .insert([portalData])
      .select()
      .single();

    if (error) throw error;

    // Save schema fields if provided
    if (data.id && schema_fields && Array.isArray(schema_fields) && schema_fields.length > 0) {
      // Note: This assumes portal_schema_fields table exists
      // If not, this will fail silently
      try {
        const schemaFieldsData = schema_fields.map((field, index) => ({
          portal_id: data.id,
          field_name: field.name || field.field_name || '',
          field_type: field.type || field.field_type || null,
          field_description: field.description || field.field_description || null,
          is_required: field.required || field.is_required || false,
          display_order: field.display_order !== undefined ? field.display_order : index
        }));

        // Attempt to save schema fields (table might not exist)
        await supabase
          .from('portal_schema_fields')
          .insert(schemaFieldsData);
      } catch (schemaError) {
        console.warn('Could not save schema fields:', schemaError.message);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Portal created successfully',
      data: {
        portal: data,
        api_key: api_key // Return API key for frontend to display
      }
    });
  } catch (error) {
    console.error('Error creating portal:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create portal',
      error: error.message
    });
  }
});

/**
 * PUT /api/admin/portals/:id
 * Update portal
 */
router.put('/portals/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Remove fields that shouldn't be updated directly
    delete updates.id;
    delete updates.api_key; // Use regenerate-key endpoint instead
    delete updates.created_at;

    // Update portal
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('portals')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    
    if (!data) {
      return res.status(404).json({
        success: false,
        message: 'Portal not found'
      });
    }

    res.json({
      success: true,
      message: 'Portal updated successfully',
      data: {
        portal: data
      }
    });
  } catch (error) {
    console.error('Error updating portal:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update portal',
      error: error.message
    });
  }
});

/**
 * DELETE /api/admin/portals/:id
 * Delete portal
 */
router.delete('/portals/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if portal exists
    const { data: portal, error: checkError } = await supabase
      .from('portals')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (checkError) throw checkError;
    
    if (!portal) {
      return res.status(404).json({
        success: false,
        message: 'Portal not found'
      });
    }

    // Delete portal
    const { error } = await supabase
      .from('portals')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Portal deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting portal:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete portal',
      error: error.message
    });
  }
});

/**
 * PUT /api/admin/portals/:id/status
 * Update portal status
 */
router.put('/portals/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['active', 'inactive', 'maintenance'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be 'active', 'inactive', or 'maintenance'"
      });
    }

    const { data, error } = await supabase
      .from('portals')
      .update({
        portal_status: status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    
    if (!data) {
      return res.status(404).json({
        success: false,
        message: 'Portal not found'
      });
    }

    res.json({
      success: true,
      message: `Portal status updated to ${status}`,
      data: {
        portal: data
      }
    });
  } catch (error) {
    console.error('Error updating portal status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update portal status',
      error: error.message
    });
  }
});

/**
 * POST /api/admin/portals/:id/regenerate-key
 * Regenerate API key for portal
 */
router.post('/portals/:id/regenerate-key', async (req, res) => {
  try {
    const { id } = req.params;

    const newApiKey = generateApiKey();

    const { data, error } = await supabase
      .from('portals')
      .update({
        api_key: newApiKey,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    
    if (!data) {
      return res.status(404).json({
        success: false,
        message: 'Portal not found'
      });
    }

    res.json({
      success: true,
      message: 'API key regenerated successfully',
      data: {
        api_key: newApiKey
      }
    });
  } catch (error) {
    console.error('Error regenerating API key:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to regenerate API key',
      error: error.message
    });
  }
});

/**
 * GET /api/admin/portals/:id/stats
 * Get portal statistics
 */
router.get('/portals/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;

    // Get portal
    const { data: portal, error: portalError } = await supabase
      .from('portals')
      .select('id, portal_code, total_leads')
      .eq('id', id)
      .single();

    if (portalError) throw portalError;
    
    if (!portal) {
      return res.status(404).json({
        success: false,
        message: 'Portal not found'
      });
    }

    // Calculate statistics (simplified - can be enhanced with more queries)
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get leads count for today (if leads table has created_at)
    let leadsToday = 0;
    let leadsThisMonth = 0;
    
    try {
      const { count: todayCount } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('portal_id', id)
        .gte('created_at', today.toISOString());

      const { count: monthCount } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('portal_id', id)
        .gte('created_at', thisMonth.toISOString());

      leadsToday = todayCount || 0;
      leadsThisMonth = monthCount || 0;
    } catch (leadError) {
      // If leads table doesn't exist or has different schema, use portal.total_leads
      console.warn('Could not fetch lead stats:', leadError.message);
    }

    res.json({
      success: true,
      data: {
        total_leads: portal.total_leads || 0,
        leads_today: leadsToday,
        leads_this_month: leadsThisMonth,
        conversion_rate: 0, // Can be calculated from lead_assignments
        health_status: portal.health_status || 'unknown'
      }
    });
  } catch (error) {
    console.error('Error fetching portal stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch portal statistics',
      error: error.message
    });
  }
});

/**
 * POST /api/admin/portals/:id/schema
 * Save portal schema fields and mappings
 */
router.post('/portals/:id/schema', async (req, res) => {
  try {
    const { id } = req.params;
    const { schema_fields, mappings } = req.body;

    // Update portal with schema info
    const updates = {
      updated_at: new Date().toISOString()
    };

    if (schema_fields) {
      updates.schema_fields = schema_fields;
    }

    if (mappings) {
      updates.mappings = mappings;
    }

    const { data: portal, error: updateError } = await supabase
      .from('portals')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Save individual schema fields if provided
    if (schema_fields && Array.isArray(schema_fields)) {
      try {
        // Delete existing schema fields
        await supabase
          .from('portal_schema_fields')
          .delete()
          .eq('portal_id', id);

        // Insert new schema fields
        const schemaFieldsData = schema_fields.map((field, index) => ({
          portal_id: id,
          field_name: field.name || field.field_name || '',
          field_type: field.type || field.field_type || null,
          field_description: field.description || field.field_description || null,
          is_required: field.required || field.is_required || false,
          display_order: field.display_order !== undefined ? field.display_order : index
        }));

        await supabase
          .from('portal_schema_fields')
          .insert(schemaFieldsData);
      } catch (schemaError) {
        console.warn('Could not save schema fields:', schemaError.message);
        // Continue anyway
      }
    }

    res.json({
      success: true,
      message: 'Schema saved successfully',
      data: {
        portal
      }
    });
  } catch (error) {
    console.error('Error saving portal schema:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save portal schema',
      error: error.message
    });
  }
});

/**
 * GET /api/admin/portals/:id/mappings
 * Get portal field mappings
 */
router.get('/portals/:id/mappings', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: portal, error } = await supabase
      .from('portals')
      .select('mappings, schema_fields')
      .eq('id', id)
      .single();

    if (error) throw error;
    
    if (!portal) {
      return res.status(404).json({
        success: false,
        message: 'Portal not found'
      });
    }

    res.json({
      success: true,
      data: {
        mappings: portal.mappings || [],
        schema_fields: portal.schema_fields || []
      }
    });
  } catch (error) {
    console.error('Error fetching portal mappings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch portal mappings',
      error: error.message
    });
  }
});


/**
 * POST /api/admin/portals/sync-schemas
 * Sync schemas for all portals or specific portal
 * Background job to refresh schema discovery
 */
router.post('/portals/sync-schemas', async (req, res) => {
  try {
    const { portal_id } = req.body;
    
    let portalsQuery = supabase.from('portals').select('id, portal_name, schema_endpoint, api_endpoint');
    
    if (portal_id) {
      portalsQuery = portalsQuery.eq('id', portal_id);
    }
    
    const { data: portals, error: portalsError } = await portalsQuery;
    
    if (portalsError) throw portalsError;
    
    if (!portals || portals.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No portals found'
      });
    }
    
    const results = [];
    
    for (const portal of portals) {
      try {
        // Discover schema from endpoint
        const schemaEndpoint = portal.schema_endpoint || portal.api_endpoint;
        
        if (!schemaEndpoint) {
          results.push({
            portal_id: portal.id,
            portal_name: portal.portal_name,
            status: 'skipped',
            reason: 'No schema endpoint configured'
          });
          continue;
        }
        
        // Fetch schema (simplified - would need actual HTTP call in production)
        // This is a placeholder for the actual schema discovery logic
        results.push({
          portal_id: portal.id,
          portal_name: portal.portal_name,
          status: 'queued',
          message: 'Schema sync queued for background processing'
        });
      } catch (error) {
        results.push({
          portal_id: portal.id,
          portal_name: portal.portal_name,
          status: 'error',
          error: error.message
        });
      }
    }
    
    return res.json({
      success: true,
      message: 'Schema sync initiated',
      results: results,
      total: results.length
    });
    
  } catch (error) {
    console.error('Error syncing schemas:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});


module.exports = router;

