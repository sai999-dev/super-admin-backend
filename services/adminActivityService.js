/**
 * Admin Activity Logging Service
 * Tracks all admin actions for audit trail
 */

const supabase = require('../config/supabaseClient');

/**
 * Log admin activity
 * @param {Object} params - Activity parameters
 * @param {string} params.adminId - Admin user ID
 * @param {string} params.action - Action performed (e.g., 'CREATE_USER', 'DELETE_LEAD')
 * @param {string} params.resource - Resource affected (e.g., 'users', 'leads', 'agencies')
 * @param {string} params.resourceId - ID of affected resource
 * @param {Object} params.details - Additional details about the action
 * @param {string} params.ipAddress - IP address of admin
 * @param {string} params.userAgent - User agent string
 */
const logAdminActivity = async ({
  adminId,
  adminEmail,
  action,
  resource,
  resourceId = null,
  details = {},
  ipAddress = null,
  userAgent = null
}) => {
  try {
    // Ensure actor_id is a valid UUID or leave null
    const isUuid = typeof adminId === 'string' && /^[0-9a-fA-F-]{36}$/.test(adminId);
    const payload = {
      actor_id: isUuid ? adminId : null,
      actor_email: adminEmail,
      action,
      resource_type: resource,
      resource_id: resourceId,
      metadata: details || {},
      ip_address: ipAddress,
      user_agent: userAgent,
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('audit_logs')
      .insert([payload]);

    if (error) {
      console.error('Failed to log admin activity:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in logAdminActivity:', error);
    return false;
  }
};

/**
 * Get admin activity logs with filtering
 */
const getAdminActivityLogs = async ({
  adminId = null,
  action = null,
  resource = null,
  startDate = null,
  endDate = null,
  page = 1,
  limit = 50
}) => {
  try {
    let query = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' });

    // Apply filters
    if (adminId) {
  query = query.eq('actor_id', adminId);
    }
    if (action) {
      query = query.eq('action', action);
    }
    if (resource) {
  query = query.eq('resource_type', resource);
    }
    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    // Pagination
    const offset = (page - 1) * limit;
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    return {
      success: true,
      data: data || [],
      pagination: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      }
    };
  } catch (error) {
    console.error('Error fetching admin activity logs:', error);
    return {
      success: false,
      message: 'Failed to fetch activity logs',
      error: error.message
    };
  }
};

/**
 * Middleware to automatically log admin actions
 */
const adminActivityLogger = (action, resource) => {
  return async (req, res, next) => {
    // Store original send function
    const originalSend = res.send;

    // Override send function to log after response
    res.send = function (data) {
      // Only log successful operations (status 200-299)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Log admin activity (don't await to avoid blocking response)
        logAdminActivity({
          adminId: req.admin?.id,
          adminEmail: req.admin?.email,
          action,
          resource,
          resourceId: req.params?.id || req.body?.id,
          details: {
            method: req.method,
            path: req.path,
            query: req.query,
            body: req.method !== 'GET' ? req.body : undefined
          },
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get('user-agent')
        }).catch(err => console.error('Failed to log activity:', err));
      }

      // Call original send
      originalSend.call(this, data);
    };

    next();
  };
};

/**
 * Action types enum for consistency
 */
const AdminActions = {
  // User management
  CREATE_USER: 'CREATE_USER',
  UPDATE_USER: 'UPDATE_USER',
  DELETE_USER: 'DELETE_USER',
  ACTIVATE_USER: 'ACTIVATE_USER',
  DEACTIVATE_USER: 'DEACTIVATE_USER',
  RESET_PASSWORD: 'RESET_PASSWORD',

  // Lead management
  CREATE_LEAD: 'CREATE_LEAD',
  UPDATE_LEAD: 'UPDATE_LEAD',
  DELETE_LEAD: 'DELETE_LEAD',
  ASSIGN_LEAD: 'ASSIGN_LEAD',
  REASSIGN_LEAD: 'REASSIGN_LEAD',
  EXPORT_LEADS: 'EXPORT_LEADS',

  // Territory management
  ADD_TERRITORY: 'ADD_TERRITORY',
  REMOVE_TERRITORY: 'REMOVE_TERRITORY',
  UPDATE_TERRITORY: 'UPDATE_TERRITORY',

  // Subscription management
  CREATE_SUBSCRIPTION: 'CREATE_SUBSCRIPTION',
  UPDATE_SUBSCRIPTION: 'UPDATE_SUBSCRIPTION',
  CANCEL_SUBSCRIPTION: 'CANCEL_SUBSCRIPTION',

  // System
  VIEW_ANALYTICS: 'VIEW_ANALYTICS',
  EXPORT_DATA: 'EXPORT_DATA',
  SYSTEM_SETTINGS: 'SYSTEM_SETTINGS',
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT'
};

/**
 * Resource types enum
 */
const AdminResources = {
  USERS: 'users',
  AGENCIES: 'agencies',
  LEADS: 'leads',
  TERRITORIES: 'territories',
  SUBSCRIPTIONS: 'subscriptions',
  ANALYTICS: 'analytics',
  SYSTEM: 'system'
};

module.exports = {
  logAdminActivity,
  getAdminActivityLogs,
  adminActivityLogger,
  AdminActions,
  AdminResources
};
