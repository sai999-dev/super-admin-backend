/**
 * Admin Routes
 * Super admin API endpoints for managing users, leads, analytics, and territories
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const supabase = require('../config/supabaseClient');
const { authenticateAdmin, generateAdminToken, generateAdminRefreshToken, verifyAdminRefreshToken } = require('../middleware/adminAuth');
const { logAdminActivity, adminActivityLogger, AdminActions, AdminResources } = require('../services/adminActivityService');

// =====================================================
// AUTHENTICATION
// =====================================================

/**
 * POST /api/admin/auth/login
 * Admin login endpoint
 */
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find admin user
    const { data: admin, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .eq('role', 'super_admin')
      .eq('is_active', true)
      .single();

    if (error || !admin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials or insufficient permissions'
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, admin.password_hash);
    
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate tokens
    const token = generateAdminToken(admin);
    const refreshToken = generateAdminRefreshToken(admin);

    // Update last login
    await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', admin.id);

    // Log activity
    await logAdminActivity({
      adminId: admin.id,
      adminEmail: admin.email,
      action: AdminActions.LOGIN,
      resource: AdminResources.SYSTEM,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent')
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        refreshToken,
        user: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role
        }
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
});

/**
 * POST /api/admin/auth/refresh
 * Refresh admin access token
 */
router.post('/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required'
      });
    }

    const decoded = verifyAdminRefreshToken(refreshToken);
    
    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token'
      });
    }

    // Get admin user
    const { data: admin, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', decoded.id)
      .eq('role', 'super_admin')
      .eq('is_active', true)
      .single();

    if (error || !admin) {
      return res.status(401).json({
        success: false,
        message: 'Admin user not found or inactive'
      });
    }

    // Generate new token
    const token = generateAdminToken(admin);

    res.json({
      success: true,
      data: { token }
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      message: 'Token refresh failed'
    });
  }
});

// Apply admin authentication to all routes below
router.use(authenticateAdmin);

// =====================================================
// USER MANAGEMENT
// =====================================================

/**
 * GET /api/admin/users
 * List all users/agencies with filtering
 */
router.get('/users', adminActivityLogger(AdminActions.VIEW_ANALYTICS, AdminResources.USERS), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 25,
      search = '',
      role = '',
      status = '',
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;

    // Build query
    let query = supabase
      .from('agencies')
      .select('*', { count: 'exact' });

    // Apply filters
    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,business_name.ilike.%${search}%`);
    }

    if (status === 'active') {
      query = query.eq('is_active', true);
    } else if (status === 'inactive') {
      query = query.eq('is_active', false);
    }

    // Get total count
    const { count } = await query.select('*', { count: 'exact', head: true });

    // Get paginated results
    const { data, error } = await query
      .range(offset, offset + limit - 1)
      .order(sortBy, { ascending: sortOrder.toUpperCase() === 'ASC' });

    if (error) throw error;

    res.json({
      success: true,
      data: {
        users: data || [],
        pagination: {
          total: count || 0,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil((count || 0) / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message
    });
  }
});

/**
 * GET /api/admin/users/:id
 * Get detailed user information
 */
router.get('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: user, error } = await supabase
      .from('agencies')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get user's subscriptions
    const { data: subscriptions } = await supabase
      .from('subscriptions')
      .select('*, subscription_plans(*)')
      .eq('agency_id', id);

    // Get user's territories
    const { data: territories } = await supabase
      .from('territories')
      .select('*')
      .eq('agency_id', id);

    // Get user's leads count
    const { count: leadsCount } = await supabase
      .from('lead_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('agency_id', id);

    res.json({
      success: true,
      data: {
        user,
        subscriptions: subscriptions || [],
        territories: territories || [],
        stats: {
          totalLeads: leadsCount || 0
        }
      }
    });
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user details',
      error: error.message
    });
  }
});

/**
 * PUT /api/admin/users/:id/status
 * Activate or deactivate a user
 */
router.put('/users/:id/status', adminActivityLogger(AdminActions.UPDATE_USER, AdminResources.USERS), async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive, reason } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isActive must be a boolean value'
      });
    }

    const { data, error } = await supabase
      .from('agencies')
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Log the specific action
    await logAdminActivity({
      adminId: req.admin.id,
      adminEmail: req.admin.email,
      action: isActive ? AdminActions.ACTIVATE_USER : AdminActions.DEACTIVATE_USER,
      resource: AdminResources.USERS,
      resourceId: id,
      details: { reason },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      data
    });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user status',
      error: error.message
    });
  }
});

/**
 * POST /api/admin/users
 * Create a new user/agency
 */
router.post('/users', adminActivityLogger(AdminActions.CREATE_USER, AdminResources.USERS), async (req, res) => {
  try {
    const {
      name,
      email,
      business_name,
      phone,
      address,
      city,
      state,
      zipcode,
      industry
    } = req.body;

    // Validation
    if (!name || !email || !business_name) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and business name are required'
      });
    }

    // Check if email exists
    const { data: existing } = await supabase
      .from('agencies')
      .select('id')
      .eq('email', email)
      .single();

    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Email already exists'
      });
    }

    // Create user
    const { data, error } = await supabase
      .from('agencies')
      .insert([{
        name,
        email,
        business_name,
        phone,
        address,
        city,
        state,
        zipcode,
        industry,
        is_active: true,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create user',
      error: error.message
    });
  }
});

// =====================================================
// LEAD MANAGEMENT
// =====================================================

/**
 * GET /api/admin/leads
 * View all leads across all agencies
 */
/**
 * GET /api/admin/leads/stats
 * Get lead statistics for the dashboard
 */
router.get('/leads/stats', adminActivityLogger(AdminActions.VIEW_ANALYTICS, AdminResources.LEADS), async (req, res) => {
  try {
    // Get total leads
    const { count: totalLeads } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true });

    // Get assigned leads (via lead_assignments)
    const { data: assignedData } = await supabase
      .from('lead_assignments')
      .select('lead_id')
      .not('lead_id', 'is', null);
    
    const assignedLeads = new Set(assignedData?.map(a => a.lead_id) || []).size;

    // Get leads by status
    const { data: statusData } = await supabase
      .from('leads')
      .select('status');
    
    const activeLeads = statusData?.filter(l => l.status === 'ACTIVE').length || 0;
    const unassignedLeads = (totalLeads || 0) - assignedLeads;

    // Get today's leads
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count: leadsToday } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', today.toISOString());

    res.json({
      success: true,
      data: {
        totalLeads: totalLeads || 0,
        assignedLeads: assignedLeads || 0,
        activeLeads: activeLeads || 0,
        unassignedLeads: unassignedLeads || 0,
        leadsToday: leadsToday || 0
      }
    });
  } catch (error) {
    console.error('Error fetching lead stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch lead statistics',
      error: error.message
    });
  }
});

/**
 * GET /api/admin/leads
 * Get all leads with filtering and pagination
 */
router.get('/leads', adminActivityLogger(AdminActions.VIEW_ANALYTICS, AdminResources.LEADS), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 25,
      search = '',
      status = '',
      portal_id = '',
      agency_id = '',
      startDate = '',
      endDate = '',
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;

    // Build query
    let query = supabase
      .from('leads')
      .select(`
        *,
        portals(portal_name),
        lead_assignments!inner(
          id,
          agency_id,
          status,
          agencies(name, business_name)
        )
      `, { count: 'exact' });

    // Apply filters
    if (search) {
      query = query.or(`lead_name.ilike.%${search}%,contact_email.ilike.%${search}%,contact_phone.ilike.%${search}%`);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (portal_id) {
      query = query.eq('registry_portal_id', portal_id);
    }

    if (agency_id) {
      query = query.eq('lead_assignments.agency_id', agency_id);
    }

    if (startDate) {
      query = query.gte('created_at', startDate);
    }

    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    // Get total count
    const { count } = await query.select('*', { count: 'exact', head: true });

    // Get paginated results
    const { data, error } = await query
      .range(offset, offset + limit - 1)
      .order(sortBy, { ascending: sortOrder.toUpperCase() === 'ASC' });

    if (error) throw error;

    res.json({
      success: true,
      data: {
        leads: data || [],
        pagination: {
          total: count || 0,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil((count || 0) / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch leads',
      error: error.message
    });
  }
});

/**
 * POST /api/admin/leads
 * Create a new lead manually
 */
router.post('/leads', adminActivityLogger(AdminActions.CREATE_LEAD, AdminResources.LEADS), async (req, res) => {
  try {
    const {
      lead_name,
      contact_email,
      contact_phone,
      city,
      state,
      zipcode,
      industry_type,
      service_needed,
      portal_id,
      lead_data = {}
    } = req.body;

    // Validation
    if (!lead_name || !contact_phone || !city) {
      return res.status(400).json({
        success: false,
        message: 'Lead name, phone, and city are required'
      });
    }

    // Create lead
    const { data: lead, error } = await supabase
      .from('leads')
      .insert([{
        lead_name,
        contact_email,
        contact_phone,
        city,
        state,
        zipcode,
        industry_type,
        registry_portal_id: portal_id,
        status: 'new',
        lead_data: JSON.stringify(lead_data),
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Lead created successfully',
      data: lead
    });
  } catch (error) {
    console.error('Error creating lead:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create lead',
      error: error.message
    });
  }
});

/**
 * PUT /api/admin/leads/:id/assign
 * Assign or reassign a lead to an agency
 */
router.put('/leads/:id/assign', adminActivityLogger(AdminActions.ASSIGN_LEAD, AdminResources.LEADS), async (req, res) => {
  try {
    const { id } = req.params;
    const { agency_id, notes } = req.body;

    if (!agency_id) {
      return res.status(400).json({
        success: false,
        message: 'Agency ID is required'
      });
    }

    // Check if lead exists
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', id)
      .single();

    if (leadError || !lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    // Create assignment
    const { data: assignment, error: assignError } = await supabase
      .from('lead_assignments')
      .insert([{
        lead_id: id,
        agency_id,
        status: 'assigned',
        assigned_at: new Date().toISOString(),
        notes
      }])
      .select()
      .single();

    if (assignError) throw assignError;

    // Update lead status
    await supabase
      .from('leads')
      .update({ status: 'assigned' })
      .eq('id', id);

    res.json({
      success: true,
      message: 'Lead assigned successfully',
      data: assignment
    });
  } catch (error) {
    console.error('Error assigning lead:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign lead',
      error: error.message
    });
  }
});

// =====================================================
// ANALYTICS
// =====================================================

/**
 * GET /api/admin/analytics
 * Get dashboard metrics and analytics
 */
router.get('/analytics', adminActivityLogger(AdminActions.VIEW_ANALYTICS, AdminResources.ANALYTICS), async (req, res) => {
  try {
    // Get total users count
    const { count: totalUsers } = await supabase
      .from('agencies')
      .select('*', { count: 'exact', head: true });

    // Get active users count
    const { count: activeUsers } = await supabase
      .from('agencies')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    // Get total leads count
    const { count: totalLeads } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true });

    // Get leads this month
    const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const { count: leadsThisMonth } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', firstDayOfMonth);

    // Get total subscriptions
    const { count: totalSubscriptions } = await supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'ACTIVE');

    // Get revenue data (sum of subscription payments)
    const { data: revenueData } = await supabase
      .from('subscriptions')
      .select('subscription_plans(base_price)')
      .eq('status', 'ACTIVE');

    const totalRevenue = revenueData?.reduce((sum, item) => {
      return sum + (item.subscription_plans?.base_price || 0);
    }, 0) || 0;

    // Get leads by status
    const { data: leadsByStatus } = await supabase
      .from('leads')
      .select('status')
      .then(result => {
        if (result.data) {
          const statusCounts = {};
          result.data.forEach(lead => {
            statusCounts[lead.status] = (statusCounts[lead.status] || 0) + 1;
          });
          return { data: statusCounts };
        }
        return { data: {} };
      });

    // Get recent activities
    const { data: recentLeads } = await supabase
      .from('leads')
      .select('id, lead_name, status, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    res.json({
      success: true,
      data: {
        overview: {
          totalUsers: totalUsers || 0,
          activeUsers: activeUsers || 0,
          totalLeads: totalLeads || 0,
          leadsThisMonth: leadsThisMonth || 0,
          totalSubscriptions: totalSubscriptions || 0,
          monthlyRevenue: totalRevenue
        },
        leadsByStatus: leadsByStatus || {},
        recentLeads: recentLeads || []
      }
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics',
      error: error.message
    });
  }
});

// =====================================================
// TERRITORY MANAGEMENT
// =====================================================

/**
 * GET /api/admin/territories
 * Get all territories with agency assignments
 */
router.get('/territories', adminActivityLogger(AdminActions.VIEW_ANALYTICS, AdminResources.TERRITORIES), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search = '',
      type = '', // zipcode, city, county, state
      agency_id = ''
    } = req.query;

    const offset = (page - 1) * limit;

    let query = supabase
      .from('territories')
      .select(`
        *,
        agencies(name, business_name, email),
        subscriptions(status)
      `, { count: 'exact' })
      .is('deleted_at', null);

    // Apply filters
    if (search) {
      query = query.or(`value.ilike.%${search}%,city.ilike.%${search}%,zipcode.ilike.%${search}%`);
    }

    if (type) {
      query = query.eq('type', type);
    }

    if (agency_id) {
      query = query.eq('agency_id', agency_id);
    }

    // Get total count
    const { count } = await query.select('*', { count: 'exact', head: true });

    // Get paginated results
    const { data, error } = await query
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: {
        territories: data || [],
        pagination: {
          total: count || 0,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil((count || 0) / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching territories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch territories',
      error: error.message
    });
  }
});

/**
 * POST /api/admin/territories
 * Add a new territory to an agency
 */
router.post('/territories', adminActivityLogger(AdminActions.ADD_TERRITORY, AdminResources.TERRITORIES), async (req, res) => {
  try {
    const {
      subscription_id,
      agency_id,
      type, // zipcode, city, county, state
      value,
      city,
      state,
      zipcode,
      priority = 0
    } = req.body;

    // Validation
    if (!subscription_id || !agency_id || !type || !value) {
      return res.status(400).json({
        success: false,
        message: 'Subscription ID, agency ID, type, and value are required'
      });
    }

    // Check for conflicts
    const { data: existing } = await supabase
      .from('territories')
      .select('*')
      .eq('subscription_id', subscription_id)
      .eq('type', type)
      .eq('value', value)
      .is('deleted_at', null)
      .single();

    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Territory already exists for this subscription'
      });
    }

    // Create territory
    const { data, error } = await supabase
      .from('territories')
      .insert([{
        subscription_id,
        agency_id,
        type,
        value,
        city,
        state,
        zipcode,
        priority,
        is_active: true,
        added_by: req.admin.id,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Territory added successfully',
      data
    });
  } catch (error) {
    console.error('Error adding territory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add territory',
      error: error.message
    });
  }
});

/**
 * DELETE /api/admin/territories/:id
 * Remove a territory
 */
router.delete('/territories/:id', adminActivityLogger(AdminActions.REMOVE_TERRITORY, AdminResources.TERRITORIES), async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('territories')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: req.admin.id
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Territory removed successfully',
      data
    });
  } catch (error) {
    console.error('Error removing territory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove territory',
      error: error.message
    });
  }
});

// =====================================================
// ACTIVITY LOGS
// =====================================================

/**
 * GET /api/admin/activity-logs
 * Get admin activity logs
 */
router.get('/activity-logs', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      adminId = null,
      action = null,
      resource = null,
      startDate = null,
      endDate = null
    } = req.query;

    const { getAdminActivityLogs } = require('../services/adminActivityService');

    const result = await getAdminActivityLogs({
      adminId,
      action,
      resource,
      startDate,
      endDate,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    if (!result.success) {
      throw new Error(result.message);
    }

    res.json(result);
  } catch (error) {
    console.error('Error fetching activity logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activity logs',
      error: error.message
    });
  }
});

module.exports = router;
