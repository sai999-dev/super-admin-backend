/**
 * Audit Service
 * Logs all critical operations for auditing and debugging
 */

const supabase = require('../config/supabaseClient');
const logger = require('../utils/logger');

class AuditService {
  /**
   * Log an audit action
   * @param {Object} options - Audit log options
   * @param {string} options.action - Action name (e.g., 'webhook_received', 'lead_created')
   * @param {string} options.resource_type - Resource type (e.g., 'lead', 'portal', 'agency')
   * @param {string} options.resource_id - Resource ID
   * @param {string} options.user_id - User ID (optional)
   * @param {Object} options.metadata - Additional metadata
   * @param {string} options.status - Status ('success', 'failed', 'pending')
   * @param {string} options.message - Optional message
   * @returns {Promise<Object>} - Audit log entry
   */
  async log(options) {
    try {
      const auditEntry = {
        action: options.action,
        resource_type: options.resource_type || 'unknown',
        resource_id: options.resource_id || null,
        user_id: options.user_id || null,
        metadata: options.metadata || {},
        status: options.status || 'success',
        message: options.message || null,
        created_at: new Date().toISOString()
      };

      // Try to insert into admin_activity_logs table
      const { data, error } = await supabase
        .from('admin_activity_logs')
        .insert([auditEntry])
        .select()
        .single();

      if (error && error.code === '42P01') {
        // Table doesn't exist - log to console only
        logger.info('Audit log:', auditEntry);
        return {
          id: 'console-log',
          ...auditEntry,
          logged_to_db: false
        };
      }

      if (error) {
        logger.warn('Error logging audit entry:', error.message);
        // Still log to console
        logger.info('Audit log (console):', auditEntry);
        return {
          id: 'console-log',
          ...auditEntry,
          logged_to_db: false
        };
      }

      return data;

    } catch (error) {
      logger.error('Critical error in audit service:', error);
      // Always log to console as fallback
      logger.info('Audit log (console fallback):', options);
      return {
        id: 'console-log',
        action: options.action,
        status: 'logged_to_console',
        created_at: new Date().toISOString()
      };
    }
  }

  /**
   * Log webhook reception
   * @param {string} portalId - Portal ID
   * @param {string} portalCode - Portal code
   * @param {Object} payload - Webhook payload
   * @param {string} status - Status ('success', 'failed')
   * @param {string} message - Optional message
   */
  async logWebhook(portalId, portalCode, payload, status = 'success', message = null) {
    return await this.log({
      action: 'webhook_received',
      resource_type: 'portal',
      resource_id: portalId,
      metadata: {
        portal_code: portalCode,
        payload_size: JSON.stringify(payload).length,
        payload_keys: Object.keys(payload || {})
      },
      status,
      message
    });
  }

  /**
   * Log lead creation
   * @param {string} leadId - Lead ID
   * @param {string} portalId - Portal ID
   * @param {Object} leadData - Lead data
   */
  async logLeadCreation(leadId, portalId, leadData) {
    return await this.log({
      action: 'lead_created',
      resource_type: 'lead',
      resource_id: leadId,
      metadata: {
        portal_id: portalId,
        territory: leadData.territory || leadData.zipcode,
        industry: leadData.industry_type
      },
      status: 'success'
    });
  }

  /**
   * Log lead assignment
   * @param {string} leadId - Lead ID
   * @param {string} agencyId - Agency ID
   * @param {string} assignmentId - Assignment ID
   */
  async logLeadAssignment(leadId, agencyId, assignmentId) {
    return await this.log({
      action: 'lead_assigned',
      resource_type: 'lead',
      resource_id: leadId,
      metadata: {
        agency_id: agencyId,
        assignment_id: assignmentId
      },
      status: 'success'
    });
  }

  /**
   * Log notification sent
   * @param {string} agencyId - Agency ID
   * @param {string} notificationId - Notification ID
   * @param {string} type - Notification type
   */
  async logNotification(agencyId, notificationId, type) {
    return await this.log({
      action: 'notification_sent',
      resource_type: 'notification',
      resource_id: notificationId,
      metadata: {
        agency_id: agencyId,
        notification_type: type
      },
      status: 'success'
    });
  }
}

module.exports = new AuditService();

