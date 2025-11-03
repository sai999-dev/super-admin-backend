const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient');
const { authenticateAdmin } = require('../middleware/adminAuth');

/**
 * SYSTEM CONFIGURATION & AUDIT ROUTES - SUPER ADMIN PORTAL
 * System settings, industries, audit logs
 */

// Apply admin authentication to all routes
router.use(authenticateAdmin);

// ============ AUDIT LOGS ============

// GET /api/admin/audit-logs - Get audit trail with filters
router.get('/audit-logs', async (req, res) => {
  try {
    const { page = 1, limit = 50, user_id, action, entity_type, start_date, end_date } = req.query;
    
    let query = supabase
      .from('audit_logs')
      .select(`
        *,
        users(email)
      `, { count: 'exact' });
    
    // Filter by user
    if (user_id) query = query.eq('user_id', user_id);
    
    // Filter by action
    if (action) query = query.eq('action', action);
    
    // Filter by entity type
    if (entity_type) query = query.eq('entity_type', entity_type);
    
    // Date range
    if (start_date) query = query.gte('created_at', start_date);
    if (end_date) query = query.lte('created_at', end_date);
    
    // Pagination
    const offset = (page - 1) * limit;
    query = query
      .range(offset, offset + parseInt(limit) - 1)
      .order('created_at', { ascending: false });
    
    const { data, error, count } = await query;
    
    if (error) throw error;
    
    res.json({
      success: true,
      data: {
        logs: data,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          totalPages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch audit logs', 
      error: error.message 
    });
  }
});

// GET /api/admin/audit-logs/:userId - Get user-specific audit trail
router.get('/audit-logs/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    
    const offset = (page - 1) * limit;
    
    const { data, error, count } = await supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .range(offset, offset + parseInt(limit) - 1)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    res.json({
      success: true,
      data: {
        logs: data,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count
        }
      }
    });
  } catch (error) {
    console.error('Error fetching user audit logs:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch user audit logs', 
      error: error.message 
    });
  }
});

// ============ SYSTEM SETTINGS ============

// GET /api/admin/system/settings - Get all system settings
router.get('/system/settings', async (req, res) => {
  try {
    // Try to get from system_settings table, if it exists
    const { data, error } = await supabase
      .from('system_settings')
      .select('*')
      .single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
      throw error;
    }
    
    // Default settings if table doesn't exist or is empty
    const defaultSettings = {
      site_name: 'LeadMarketplace Pro',
      lead_distribution_method: 'round_robin', // round_robin, territory_based, manual
      auto_assign_leads: true,
      require_payment_before_leads: false,
      default_lead_price: 25.00,
      commission_rate: 10.0,
      tax_rate: 8.0,
      currency: 'USD',
      timezone: 'America/New_York',
      email_notifications: true,
      sms_notifications: false,
      max_leads_per_agency: 100,
      lead_expiry_days: 30,
      support_email: 'support@leadmarketplace.com',
      support_phone: '1-800-LEADS-01'
    };
    
    res.json({
      success: true,
      data: {
        settings: data || defaultSettings
      }
    });
  } catch (error) {
    console.error('Error fetching system settings:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch system settings', 
      error: error.message 
    });
  }
});

// PUT /api/admin/system/settings - Update system settings
router.put('/system/settings', async (req, res) => {
  try {
    const updates = req.body;
    
    // Check if system_settings table exists and has data
    const { data: existing } = await supabase
      .from('system_settings')
      .select('id')
      .single();
    
    let data, error;
    
    if (existing) {
      // Update existing settings
      const result = await supabase
        .from('system_settings')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single();
      
      data = result.data;
      error = result.error;
    } else {
      // Insert new settings
      const result = await supabase
        .from('system_settings')
        .insert({
          ...updates,
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      
      data = result.data;
      error = result.error;
    }
    
    if (error) throw error;
    
    // Log to audit
    try {
      await supabase
        .from('audit_logs')
        .insert({
          user_id: req.user?.id || null,
          action: 'UPDATE_SYSTEM_SETTINGS',
          entity_type: 'system_settings',
          entity_id: data.id,
          changes: updates,
          ip_address: req.ip,
          created_at: new Date().toISOString()
        });
    } catch (err) {
      console.log('Audit log not recorded');
    }
    
    res.json({
      success: true,
      message: 'System settings updated successfully',
      data: { settings: data }
    });
  } catch (error) {
    console.error('Error updating system settings:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update system settings', 
      error: error.message 
    });
  }
});

// ============ INDUSTRIES MANAGEMENT ============

// GET /api/admin/system/industries - List all industries
router.get('/system/industries', async (req, res) => {
  try {
    // Try to get from industries table
    const { data, error } = await supabase
      .from('industries')
      .select('*')
      .order('name');
    
    if (error && error.code !== '42P01') { // 42P01 = table doesn't exist
      throw error;
    }
    
    // Default industries if table doesn't exist
    const defaultIndustries = [
      { id: 1, name: 'Real Estate', slug: 'real_estate', description: 'Property buying, selling, and rentals', is_active: true },
      { id: 2, name: 'Solar Energy', slug: 'solar', description: 'Solar panel installation and maintenance', is_active: true },
      { id: 3, name: 'Roofing', slug: 'roofing', description: 'Roof repair and replacement services', is_active: true },
      { id: 4, name: 'HVAC', slug: 'hvac', description: 'Heating, ventilation, and air conditioning', is_active: true },
      { id: 5, name: 'Home Improvement', slug: 'home_improvement', description: 'General home renovation and improvement', is_active: true },
      { id: 6, name: 'Insurance', slug: 'insurance', description: 'Insurance products and services', is_active: true },
      { id: 7, name: 'Legal Services', slug: 'legal', description: 'Legal consultation and services', is_active: true },
      { id: 8, name: 'Financial Services', slug: 'financial', description: 'Financial planning and services', is_active: true },
      { id: 9, name: 'Auto Services', slug: 'auto', description: 'Automotive repair and services', is_active: true },
      { id: 10, name: 'Health & Wellness', slug: 'health', description: 'Healthcare and wellness services', is_active: true }
    ];
    
    res.json({
      success: true,
      data: {
        industries: data || defaultIndustries
      }
    });
  } catch (error) {
    console.error('Error fetching industries:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch industries', 
      error: error.message 
    });
  }
});

// POST /api/admin/system/industries - Add new industry
router.post('/system/industries', async (req, res) => {
  try {
    const { name, slug, description } = req.body;
    
    if (!name || !slug) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: name, slug' 
      });
    }
    
    const { data, error } = await supabase
      .from('industries')
      .insert({
        name,
        slug,
        description: description || '',
        is_active: true,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) throw error;
    
    // Log to audit
    try {
      await supabase
        .from('audit_logs')
        .insert({
          user_id: req.user?.id || null,
          action: 'CREATE_INDUSTRY',
          entity_type: 'industries',
          entity_id: data.id,
          changes: { name, slug },
          ip_address: req.ip,
          created_at: new Date().toISOString()
        });
    } catch (err) {
      console.log('Audit log not recorded');
    }
    
    res.status(201).json({
      success: true,
      message: 'Industry created successfully',
      data: { industry: data }
    });
  } catch (error) {
    console.error('Error creating industry:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create industry', 
      error: error.message 
    });
  }
});

// PUT /api/admin/system/industries/:id - Update industry
router.put('/system/industries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug, description, is_active } = req.body;
    
    const updates = {};
    if (name) updates.name = name;
    if (slug) updates.slug = slug;
    if (description !== undefined) updates.description = description;
    if (is_active !== undefined) updates.is_active = is_active;
    updates.updated_at = new Date().toISOString();
    
    const { data, error } = await supabase
      .from('industries')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({
      success: true,
      message: 'Industry updated successfully',
      data: { industry: data }
    });
  } catch (error) {
    console.error('Error updating industry:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update industry', 
      error: error.message 
    });
  }
});

// DELETE /api/admin/system/industries/:id - Delete industry
router.delete('/system/industries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Soft delete
    const { error } = await supabase
      .from('industries')
      .update({ 
        is_active: false,
        deleted_at: new Date().toISOString()
      })
      .eq('id', id);
    
    if (error) throw error;
    
    res.json({
      success: true,
      message: 'Industry deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting industry:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete industry', 
      error: error.message 
    });
  }
});

// ============ SYSTEM STATS ============

// GET /api/admin/system/stats - Get system-wide statistics
router.get('/system/stats', async (req, res) => {
  try {
    // Total agencies
    const { count: totalAgencies } = await supabase
      .from('agencies')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);
    
    // Total users
    const { count: totalUsers } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);
    
    // Total leads
    const { count: totalLeads } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true });
    
    // Active subscriptions
    const { count: activeSubscriptions } = await supabase
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');
    
    // System health metrics
    const uptime = process.uptime();
    const memory = process.memoryUsage();
    
    res.json({
      success: true,
      data: {
        totalAgencies: totalAgencies || 0,
        totalUsers: totalUsers || 0,
        totalLeads: totalLeads || 0,
        activeSubscriptions: activeSubscriptions || 0,
        system: {
          uptime: Math.floor(uptime),
          memory: {
            used: Math.floor(memory.heapUsed / 1024 / 1024), // MB
            total: Math.floor(memory.heapTotal / 1024 / 1024) // MB
          }
        }
      }
    });
  } catch (error) {
    console.error('Error fetching system stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch system statistics', 
      error: error.message 
    });
  }
});

module.exports = router;
