/**
 * Mobile Territory Controller
 * Handles agency territory-related requests for mobile app
 */

const supabase = require('../config/supabaseClient');

/**
 * GET /api/mobile/territories
 * Get agency's current territories
 */
exports.getAgencyTerritories = async (req, res) => {
  try {
    const agencyId = req.agency.id;
    const { isActive, type, state, search } = req.query;

    let query = supabase
      .from('territories')
      .select('*, subscription:subscriptions(id, status, subscription_plans(plan_name))')
      .eq('agency_id', agencyId)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true });

    if (isActive !== undefined) query = query.eq('is_active', isActive === 'true');
    if (type) query = query.eq('type', type);
    if (state) query = query.eq('state', state);
    if (search) query = query.or(`value.ilike.%${search}%,city.ilike.%${search}%,zipcode.ilike.%${search}%`);

    const { data: territories, error } = await query;
    if (error) throw error;

    const shaped = (territories || []).map(t => ({
          id: t.id,
          type: t.type,
          value: t.value,
          state: t.state,
          county: t.county || t.country || null,
          city: t.city || null,
          zipcode: t.zipcode || null,
          isActive: t.is_active,
          priority: t.priority,
          addedDate: t.created_at,
          lastUpdated: t.updated_at,
          subscription: t.subscription ? {
            id: t.subscription.id,
            status: t.subscription.status,
            planName: t.subscription.subscription_plans?.plan_name || null
          } : null
        }));

    // Backward-compat for Flutter TerritoryService: provide top-level zipcodes array
    const zipcodes = shaped
      .filter(t => t.type === 'zipcode' && (t.zipcode || t.value))
      .map(t => t.zipcode || t.value)
      .filter(Boolean);

    res.status(200).json({
      success: true,
      data: {
        territories: shaped,
        totalCount: territories ? territories.length : 0,
        activeCount: (territories || []).filter(t => t.is_active).length
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

const clampLimit = (value, min = 1, max = 100) => {
  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric)) return min;
  return Math.min(Math.max(numeric, min), max);
};

const sanitizeSearchTerm = (value = '') => value
  .toString()
  .replace(/[%_]/g, (match) => `\\${match}`)
  .replace(/[\r\n]+/g, ' ')
  .trim();

const toNumber = (value, fallback = 0) => {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const mapTerritoryRecord = (record = {}) => ({
  id: record.id,
  type: record.type,
  value: record.value,
  state: record.state || null,
  county: record.county || record.country || null,
  city: record.city || null,
  zipcode: record.zipcode || null,
  isActive: record.is_active !== false,
  priority: record.priority ?? null,
  addedDate: record.created_at || null,
  lastUpdated: record.updated_at || null
});

const logAuditEvent = async (req, { action, resourceId, metadata }) => {
  try {
    await supabase.from('audit_logs').insert([
      {
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
      }
    ]);
  } catch (auditError) {
    console.warn('Failed to write audit log:', auditError.message);
  }
};

/**
 * GET /api/mobile/territories/available
 * Get territories available for claiming
 */
exports.getAvailableTerritories = async (req, res) => {
  try {
    const {
      state,
      type,
      search,
      page = 1,
      limit = 50
    } = req.query;

    const currentPage = Math.max(Number.parseInt(page, 10) || 1, 1);
    const pageSize = clampLimit(limit, 1, 200);
    const offset = (currentPage - 1) * pageSize;
    const sanitizedSearch = search ? sanitizeSearchTerm(search) : '';

    let query = supabase
      .from('territories')
      .select('id, type, value, state, county, city, zipcode, is_active, priority, created_at, updated_at', { count: 'exact' })
      .eq('is_active', false)
      .order('state', { ascending: true })
      .order('city', { ascending: true })
      .order('value', { ascending: true })
      .limit(pageSize * 2); // fetch some extra before mixing with samples

    if (state) {
      query = query.eq('state', state);
    }

    if (type) {
      query = query.eq('type', type);
    }

    if (sanitizedSearch) {
      query = query.or([
        `value.ilike.%${sanitizedSearch}%`,
        `city.ilike.%${sanitizedSearch}%`,
        `zipcode.ilike.%${sanitizedSearch}%`
      ].join(','));
    }

    const { data: dbTerritories, error } = await query;
    if (error) throw error;

    const baseTerritories = (dbTerritories || []).map(mapTerritoryRecord);

    // Provide a handful of sample territories so the UI always shows choices
    const sampleTerritories = [
      { id: 'sample-1', type: 'zipcode', value: '75201', state: 'TX', city: 'Dallas', zipcode: '75201', is_active: false },
      { id: 'sample-2', type: 'zipcode', value: '75202', state: 'TX', city: 'Dallas', zipcode: '75202', is_active: false },
      { id: 'sample-3', type: 'city', value: 'Austin', state: 'TX', city: 'Austin', is_active: false }
    ].map(mapTerritoryRecord);

    const merged = [...baseTerritories, ...sampleTerritories];
    const uniqueByKey = Array.from(
      merged.reduce((acc, item) => {
        const key = `${item.type || 'unknown'}::${item.value || item.zipcode || item.city || item.id}`;
        if (!acc.has(key)) acc.set(key, item);
        return acc;
      }, new Map()).values()
    );

    const paged = uniqueByKey.slice(offset, offset + pageSize);
    const totalPages = uniqueByKey.length === 0
      ? 0
      : Math.ceil(uniqueByKey.length / pageSize);

    res.status(200).json({
      success: true,
      data: {
        territories: paged,
        pagination: {
          page: currentPage,
          limit: pageSize,
          total: uniqueByKey.length,
          totalPages
        }
      }
    });
  } catch (error) {
    console.error('Error in getAvailableTerritories:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
};

/**
 * POST /api/mobile/territories
 * Add a zipcode territory for the authenticated agency (Flutter compatibility)
 */
exports.addTerritory = async (req, res) => {
  try {
    const agencyId = req.agency.id;
    const { zipcode, city } = req.body || {};

    if (!zipcode) {
      return res.status(400).json({ success: false, message: 'zipcode is required' });
    }

    // Find active/trial subscription
    const { data: subscription, error: subErr } = await supabase
      .from('subscriptions')
      .select('id, status')
      .eq('agency_id', agencyId)
      .in('status', ['trial','active'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (subErr || !subscription) {
      return res.status(400).json({ success: false, message: 'No active subscription found' });
    }

    // Check duplicate
    const { data: existing } = await supabase
      .from('territories')
      .select('id')
      .eq('agency_id', agencyId)
      .eq('type', 'zipcode')
      .or(`value.eq.${zipcode},zipcode.eq.${zipcode}`)
      .eq('is_active', true)
      .limit(1);

    if (existing && existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Territory already exists' });
    }

    // Insert territory
    const insertPayload = {
      subscription_id: subscription.id,
      agency_id: agencyId,
      type: 'zipcode',
      value: String(zipcode),
      zipcode: String(zipcode),
      city: city || null,
      is_active: true,
      priority: 5,
      metadata: { source: 'flutter_app' }
    };

    const { data: created, error } = await supabase
      .from('territories')
      .insert([insertPayload])
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    console.error('Error in addTerritory:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * DELETE /api/mobile/territories/:zipcode
 * Remove a zipcode territory for the authenticated agency (Flutter compatibility)
 */
exports.removeTerritory = async (req, res) => {
  try {
    const agencyId = req.agency.id;
    const { zipcode } = req.params;

    if (!zipcode) {
      return res.status(400).json({ success: false, message: 'zipcode is required' });
    }

    const { data: existing } = await supabase
      .from('territories')
      .select('id')
      .eq('agency_id', agencyId)
      .eq('type', 'zipcode')
      .or(`value.eq.${zipcode},zipcode.eq.${zipcode}`)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Territory not found' });
    }

    const { error } = await supabase
      .from('territories')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', existing.id);

    if (error) throw error;

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error in removeTerritory:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * POST /api/mobile/territories/request
 * Request territory addition (requires admin approval)
 */
exports.requestTerritoryAddition = async (req, res) => {
  try {
    const agencyId = req.agency.id;
    const { territories, notes } = req.body;

    const { data: subscription, error: subscriptionError } = await supabase
      .from('subscriptions')
      .select('id, status, plan_id, billing_cycle, current_units, metadata')
      .eq('agency_id', agencyId)
      .in('status', ['trial', 'active'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subscriptionError) throw subscriptionError;
    if (!subscription) {
      return res.status(400).json({
        success: false,
        message: 'No active subscription found. Please subscribe to a plan first.'
      });
    }

    const planResponse = await supabase
      .from('subscription_plans')
      .select('id, plan_name, unit_type, max_units')
      .eq('id', subscription.plan_id)
      .maybeSingle();

    if (planResponse.error) throw planResponse.error;
    const plan = planResponse.data;

    if (!plan) {
      return res.status(400).json({
        success: false,
        message: 'Subscription plan could not be resolved'
      });
    }

    const activeCountResp = await supabase
      .from('territories')
      .select('id', { count: 'exact', head: true })
      .eq('agency_id', agencyId)
      .eq('is_active', true)
      .is('deleted_at', null);

    if (activeCountResp.error) throw activeCountResp.error;

    const currentTerritoryCount = activeCountResp.count || 0;
    const maxUnits = plan.max_units ?? toNumber(subscription.metadata?.max_units, null);

    if (typeof maxUnits === 'number' && currentTerritoryCount + territories.length > maxUnits) {
      return res.status(400).json({
        success: false,
        message: `Adding ${territories.length} territories would exceed your limit of ${maxUnits}. Current: ${currentTerritoryCount}`
      });
    }

    const invalidTypes = territories.filter((territory) => territory.type !== plan.unit_type);
    if (invalidTypes.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Territory types must match your subscription plan (${plan.unit_type})`
      });
    }

    const values = territories.map((territory) => String(territory.value).trim());
    const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
    if (duplicates.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Duplicate territories in request: ${duplicates.join(', ')}`
      });
    }

    const existingResp = await supabase
      .from('territories')
      .select('value')
      .in('value', values)
      .eq('type', plan.unit_type)
      .eq('is_active', true);

    if (existingResp.error) throw existingResp.error;

    if ((existingResp.data || []).length > 0) {
      return res.status(400).json({
        success: false,
        message: `Some territories are already claimed: ${(existingResp.data || []).map((item) => item.value).join(', ')}`
      });
    }

    const now = new Date().toISOString();
    const insertPayload = territories.map((territory) => ({
      agency_id: agencyId,
      subscription_id: subscription.id,
      type: territory.type,
      value: String(territory.value),
      state: territory.state || null,
      city: territory.city || null,
      county: territory.county || null,
      zipcode: territory.zipcode ? String(territory.zipcode) : null,
      priority: territory.priority ?? 5,
      is_active: false,
      metadata: {
        requestedBy: 'mobile_app',
        requestNotes: notes || null,
        requestedAt: now
      },
      created_at: now,
      updated_at: now
    }));

    const insertResp = await supabase
      .from('territories')
      .insert(insertPayload)
      .select('*');

    if (insertResp.error) throw insertResp.error;

    const createdTerritories = insertResp.data || [];

    await logAuditEvent(req, {
      action: 'TERRITORY_REQUEST',
      resourceId: createdTerritories[0]?.id || 'bulk',
      metadata: {
        territories: values,
        notes: notes || null,
        subscriptionId: subscription.id
      }
    });

    res.status(201).json({
      success: true,
      message: 'Territory request submitted successfully',
      data: {
        requestId: `req_${Date.now()}`,
        territories: createdTerritories.map((territory) => ({
          id: territory.id,
          type: territory.type,
          value: territory.value,
          state: territory.state,
          city: territory.city,
          status: 'pending_approval'
        })),
        subscription: {
          id: subscription.id,
          currentUnits: currentTerritoryCount,
          maxUnits: maxUnits ?? null,
          remainingUnits: typeof maxUnits === 'number'
            ? Math.max(maxUnits - currentTerritoryCount - territories.length, 0)
            : null
        }
      }
    });

  } catch (error) {
    console.error('Error in requestTerritoryAddition:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
};

/**
 * PUT /api/mobile/territories/:territoryId
 * Update territory priority or status (if allowed)
 */
exports.updateTerritory = async (req, res) => {
  try {
    const agencyId = req.agency.id;
    const { territoryId } = req.params;
    const { priority, isActive, notes } = req.body;

    const territoryResp = await supabase
      .from('territories')
      .select('*')
      .eq('id', territoryId)
      .eq('agency_id', agencyId)
      .maybeSingle();

    if (territoryResp.error) throw territoryResp.error;

    if (!territoryResp.data) {
      return res.status(404).json({
        success: false,
        message: 'Territory not found or does not belong to your agency'
      });
    }

    const territory = territoryResp.data;

    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (priority !== undefined) updateData.priority = priority;
    if (isActive !== undefined) updateData.is_active = Boolean(isActive);
    if (notes) {
      updateData.metadata = {
        ...(territory.metadata || {}),
        notes
      };
    }

    const updateResp = await supabase
      .from('territories')
      .update(updateData)
      .eq('id', territoryId)
      .select('*')
      .maybeSingle();

    if (updateResp.error) throw updateResp.error;

    const updatedTerritory = updateResp.data;

    await logAuditEvent(req, {
      action: 'TERRITORY_UPDATE',
      resourceId: territoryId,
      metadata: {
        changes: updateData,
        previousValues: {
          priority: territory.priority,
          is_active: territory.is_active
        }
      }
    });

    res.status(200).json({
      success: true,
      message: 'Territory updated successfully',
      data: {
        territory: mapTerritoryRecord(updatedTerritory)
      }
    });

  } catch (error) {
    console.error('Error in updateTerritory:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
};

/**
 * DELETE /api/mobile/territories/:territoryId
 * Request territory removal (requires admin approval)
 */
exports.requestTerritoryRemoval = async (req, res) => {
  try {
    const agencyId = req.agency.id;
    const { territoryId } = req.params;
    const { reason } = req.body;

    const territoryResp = await supabase
      .from('territories')
      .select('*')
      .eq('id', territoryId)
      .eq('agency_id', agencyId)
      .maybeSingle();

    if (territoryResp.error) throw territoryResp.error;

    if (!territoryResp.data) {
      return res.status(404).json({
        success: false,
        message: 'Territory not found or does not belong to your agency'
      });
    }

    const territory = territoryResp.data;

    const updatedMetadata = {
      ...(territory.metadata || {}),
      removalRequested: true,
      removalReason: reason || null,
      removalRequestedAt: new Date().toISOString()
    };

    const updateResp = await supabase
      .from('territories')
      .update({
        is_active: false,
        metadata: updatedMetadata,
        updated_at: new Date().toISOString()
      })
      .eq('id', territoryId)
      .select('*')
      .maybeSingle();

    if (updateResp.error) throw updateResp.error;

    await logAuditEvent(req, {
      action: 'TERRITORY_REMOVAL_REQUEST',
      resourceId: territoryId,
      metadata: {
        reason: reason || null,
        type: territory.type,
        value: territory.value,
        state: territory.state
      }
    });

    res.status(200).json({
      success: true,
      message: 'Territory removal request submitted successfully',
      data: {
        territory: {
          id: territory.id,
          type: territory.type,
          value: territory.value,
          state: territory.state,
          status: 'removal_requested'
        }
      }
    });

  } catch (error) {
    console.error('Error in requestTerritoryRemoval:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
};
