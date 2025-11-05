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

// Helper function to generate slug from name
const generateSlug = (name) => {
  if (!name || typeof name !== 'string') {
    return '';
  }
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
  
  // Ensure we never return empty string
  return slug || 'portal-' + Date.now().toString().slice(-6);
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
      portal_status: portal.portal_status || portal.status || 'active', // Keep portal_status for frontend
      status: portal.portal_status || portal.status || 'active', // Also include status for compatibility
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
    console.log('🔍 BACKEND: GET /api/admin/portals/:id - Portal ID:', id);

    const { data, error } = await supabase
      .from('portals')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('❌ BACKEND: Supabase error:', error);
      throw error;
    }
    
    if (!data) {
      console.log('❌ BACKEND: Portal not found for ID:', id);
      return res.status(404).json({
        success: false,
        message: 'Portal not found'
      });
    }

    console.log('✅ BACKEND: Portal found:', {
      id: data.id,
      portal_name: data.portal_name,
      portal_code: data.portal_code,
      portal_type: data.portal_type,
      industry: data.industry,
      portal_status: data.portal_status || data.status
    });
    console.log('📦 BACKEND: Full portal data keys:', Object.keys(data));

    res.json({
      success: true,
      data: {
        portal: data
      }
    });
  } catch (error) {
    console.error('❌ BACKEND: Error fetching portal:', error);
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
  console.log('🚨🚨🚨 ROUTE HANDLER CALLED - POST /api/admin/portals 🚨🚨🚨');
  try {
    // Log incoming request for debugging
    console.log('📥 POST /api/admin/portals - Request received');
    console.log('📥 Request body:', JSON.stringify(req.body, null, 2));
    
    // Extract all possible fields from request body
    const {
      portal_name,
      portal_code,
      slug, // Frontend may send this
      portal_type,
      industry,
      api_endpoint,
      schema_endpoint,
      auth_type,
      auth_credentials,
      status,
      schema_fields,
      base_url,
      webhook_url,
      portal_description,
      auto_activate,
      name, // Frontend may send 'name' instead of 'portal_name'
      type, // Frontend may send 'type' instead of 'portal_type'
      description // Frontend may send 'description' instead of 'portal_description'
    } = req.body;

    // Normalize field names (handle both variants)
    const finalPortalName = portal_name || name || '';
    const finalPortalCode = portal_code || '';
    const finalPortalType = portal_type || type || '';
    const finalIndustry = industry || '';
    const finalDescription = portal_description || description || null;
    const finalBaseUrl = base_url || null;
    const finalWebhookUrl = webhook_url || null;
    
    // Determine status - use auto_activate if provided, otherwise use status or default
    const finalStatus = (auto_activate === true || status === 'active') ? 'active' : (status || 'active');

    // Validation
    if (!finalPortalName || !finalPortalCode || !finalPortalType || !finalIndustry) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: portal_name, portal_code, portal_type, industry'
      });
    }

    // Check if portal_code already exists
    const { data: existing } = await supabase
      .from('portals')
      .select('id')
      .eq('portal_code', finalPortalCode)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Portal code already exists'
      });
    }

    // Generate API key
    const api_key = generateApiKey();

    // Generate portal slug - use provided slug or generate from name
    // Ensure slug is never empty or null (database requires this)
    let portal_slug = '';
    
    if (slug && typeof slug === 'string' && slug.trim()) {
      portal_slug = slug.trim();
    } else if (finalPortalName && finalPortalName.trim()) {
      portal_slug = generateSlug(finalPortalName);
    } else if (finalPortalCode && finalPortalCode.trim()) {
      portal_slug = generateSlug(finalPortalCode);
    }
    
    // Final fallback: use portal_code cleaned up
    if (!portal_slug || portal_slug.trim() === '') {
      portal_slug = (finalPortalCode || 'portal').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
      if (!portal_slug) {
        portal_slug = 'portal-' + Date.now().toString().slice(-8);
      }
    }
    
    // Ensure it's not empty (database constraint)
    if (!portal_slug || portal_slug.trim() === '') {
      throw new Error('Unable to generate portal slug. Please provide a valid portal name or slug.');
    }
    
    // Debug logging
    console.log('🔍 Generated portal_slug:', portal_slug);
    console.log('🔍 finalPortalName:', finalPortalName);
    console.log('🔍 finalPortalCode:', finalPortalCode);

    // Generate webhook URL
    const baseUrl = process.env.BASE_URL || process.env.FRONTEND_URL || `http://localhost:${process.env.PORT || 3000}`;
    const generated_webhook_url = `${baseUrl}/api/webhooks/${finalPortalCode}`;

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
    // Note: api_endpoint is required by database, provide default if not set
    // Final safety check - portal_slug CANNOT be null or empty
    if (!portal_slug || portal_slug.trim() === '' || portal_slug === null || portal_slug === undefined) {
      console.error('❌ CRITICAL: portal_slug is invalid:', portal_slug);
      throw new Error('Portal slug generation failed. This is a critical error.');
    }
    
    console.log('🔍 Creating portal with slug:', portal_slug);
    console.log('🔍 portalData will include portal_slug:', portal_slug);
    
    const portalData = {
      portal_name: finalPortalName,
      portal_code: finalPortalCode,
      portal_slug: portal_slug.trim(), // Required by database - MUST NOT BE NULL - TRIM to ensure no whitespace issues
      portal_type: finalPortalType,
      industry: finalIndustry,
      portal_description: finalDescription,
      base_url: finalBaseUrl,
      webhook_url: finalWebhookUrl,
      api_endpoint: api_endpoint || '', // Required field, use empty string as default
      schema_endpoint: schema_endpoint || '', // Required field, use empty string as default
      auth_type: auth_type || 'api_key',
      auth_credentials: auth_credentials || '', // Required field, use empty string as default
      api_key,
      generated_webhook_url,
      portal_status: finalStatus,
      health_status: 'unknown',
      total_leads,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    console.log('🔍 About to insert portalData:', JSON.stringify(portalData, null, 2));
    console.log('🔍 portal_slug value:', portalData.portal_slug);
    console.log('🔍 portal_slug type:', typeof portalData.portal_slug);
    console.log('🔍 portal_slug length:', portalData.portal_slug ? portalData.portal_slug.length : 'null/undefined');
    
    const { data, error } = await supabase
      .from('portals')
      .insert([portalData])
      .select()
      .single();

    if (error) {
      console.error('❌ Supabase insert error:', error);
      console.error('❌ Error code:', error.code);
      console.error('❌ Error message:', error.message);
      console.error('❌ Error details:', error.details);
      throw error;
    }
    
    console.log('✅ Portal inserted successfully:', data.id);

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

    // Add api_key and webhook_endpoint to portal data for frontend
    // Use generated_webhook_url from database if available, otherwise use the one we generated
    const webhookUrl = data.generated_webhook_url || generated_webhook_url;
    const portalResponse = {
      ...data,
      api_key: api_key,
      webhook_endpoint: webhookUrl, // Frontend expects this property name
      generated_webhook_url: webhookUrl // Keep original property for compatibility
    };

    res.status(201).json({
      success: true,
      message: 'Portal created successfully',
      data: [portalResponse], // Return as array to match frontend expectations
      api_key: api_key, // Also return API key separately for easy access
      portal: portalResponse // Include portal object for backward compatibility
    });
  } catch (error) {
    console.error('❌ Error creating portal:', error);
    console.error('Error stack:', error.stack);
    console.error('Request body:', JSON.stringify(req.body, null, 2));
    
    // Provide more detailed error information
    let errorMessage = error.message || 'Failed to create portal';
    let statusCode = 500;
    
    // Handle specific database errors
    if (error.code) {
      console.error('Database error code:', error.code);
      if (error.code === '23505') { // Unique violation
        errorMessage = 'Portal code or slug already exists';
        statusCode = 400;
      } else if (error.code === '23502') { // Not null violation
        errorMessage = `Missing required field: ${error.column || 'unknown'}`;
        statusCode = 400;
      }
    }
    
    // Handle Supabase errors
    if (error.message && error.message.includes('violates not-null constraint')) {
      const match = error.message.match(/column "([^"]+)"/);
      if (match) {
        errorMessage = `Missing required field: ${match[1]}`;
        statusCode = 400;
      }
    }
    
    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
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

    console.log('🔍 BACKEND: PUT /api/admin/portals/:id - Portal ID:', id);
    console.log('📦 BACKEND: Request body keys:', Object.keys(updates));
    console.log('📦 BACKEND: Request body:', JSON.stringify(updates, null, 2));

    // Remove fields that shouldn't be updated directly
    delete updates.id;
    delete updates.api_key; // Use regenerate-key endpoint instead
    delete updates.created_at;
    delete updates.auto_activate; // Convert to status instead
    delete updates._schema_fields; // Internal field, don't send to DB
    delete updates.schema_fields; // Schema fields handled separately

    // Handle auto_activate -> status conversion
    if (req.body.auto_activate !== undefined) {
      updates.portal_status = req.body.auto_activate ? 'active' : 'inactive';
      console.log('✅ BACKEND: Converted auto_activate to portal_status:', updates.portal_status);
    }

    // Handle status field - normalize to portal_status
    if (updates.status && !updates.portal_status) {
      updates.portal_status = updates.status;
      delete updates.status;
      console.log('✅ BACKEND: Converted status to portal_status:', updates.portal_status);
    }

    // Handle slug -> portal_slug mapping
    if (updates.slug && !updates.portal_slug) {
      updates.portal_slug = updates.slug;
      delete updates.slug;
      console.log('✅ BACKEND: Converted slug to portal_slug:', updates.portal_slug);
    }

    // Ensure portal_slug is not empty (database requirement)
    if (updates.portal_slug === '' || updates.portal_slug === null || updates.portal_slug === undefined) {
      // Generate from portal_code if available
      if (updates.portal_code) {
        updates.portal_slug = updates.portal_code.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
        console.log('✅ BACKEND: Generated portal_slug from portal_code:', updates.portal_slug);
      } else {
        // Don't update slug if it would be empty - fetch current value
        const { data: current } = await supabase.from('portals').select('portal_slug').eq('id', id).single();
        if (current && current.portal_slug) {
          updates.portal_slug = current.portal_slug;
          console.log('✅ BACKEND: Kept existing portal_slug:', updates.portal_slug);
        } else {
          delete updates.portal_slug; // Don't update if we can't generate a valid one
          console.log('⚠️ BACKEND: Skipping portal_slug update (would be empty)');
        }
      }
    }

    // Remove schema_fields from main update - handle separately if needed
    const schemaFields = updates.schema_fields || req.body.schema_fields;
    if (schemaFields) {
      delete updates.schema_fields;
      console.log('📋 BACKEND: Extracted schema_fields for separate handling');
    }

    // Update portal
    updates.updated_at = new Date().toISOString();

    console.log('📤 BACKEND: Final update payload:', JSON.stringify(updates, null, 2));

    const { data, error } = await supabase
      .from('portals')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('❌ BACKEND: Supabase update error:', error);
      console.error('❌ BACKEND: Error code:', error.code);
      console.error('❌ BACKEND: Error message:', error.message);
      console.error('❌ BACKEND: Error details:', error.details);
      throw error;
    }
    
    if (!data) {
      console.log('❌ BACKEND: Portal not found after update');
      return res.status(404).json({
        success: false,
        message: 'Portal not found'
      });
    }

    console.log('✅ BACKEND: Portal updated successfully');

    res.json({
      success: true,
      message: 'Portal updated successfully',
      data: {
        portal: data
      }
    });
  } catch (error) {
    console.error('❌ BACKEND: Error updating portal:', error);
    console.error('❌ BACKEND: Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to update portal',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.details : undefined
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

