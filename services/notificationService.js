/**
 * Notification Service
 * Handles push notifications via Firebase Cloud Messaging (FCM)
 */

const supabase = require('../config/supabaseClient');
const logger = require('../utils/logger');

class NotificationService {
  /**
   * Send push notification to agency
   * @param {string} agencyId - Agency UUID
   * @param {Object} notificationData - Notification payload
   * @param {string} notificationData.title - Notification title
   * @param {string} notificationData.body - Notification body
   * @param {string} notificationData.type - Notification type (lead_assigned, subscription_updated, etc.)
   * @param {Object} notificationData.data - Additional data payload
   * @returns {Promise<Object>} - Result with success status
   */
  async sendPushNotification(agencyId, notificationData) {
    try {
      const { title, body, type = 'general', data = {} } = notificationData;

      if (!title || !body) {
        throw new Error('Title and body are required for notifications');
      }

      // Get all device tokens for this agency
      const { data: devices, error: devicesError } = await supabase
        .from('agency_devices')
        .select('device_token, device_type, push_enabled')
        .eq('agency_id', agencyId)
        .eq('push_enabled', true)
        .eq('is_active', true);

      if (devicesError) {
        logger.error('Error fetching devices:', devicesError);
        throw devicesError;
      }

      if (!devices || devices.length === 0) {
        logger.warn(`No active devices found for agency ${agencyId}`);
        return {
          success: false,
          message: 'No active devices found for agency',
          sentCount: 0
        };
      }

      // Check if Firebase is configured
      const firebaseAdmin = this.getFirebaseAdmin();
      if (!firebaseAdmin) {
        logger.warn('Firebase not configured. Saving notification to queue.');
        return await this.queueNotification(agencyId, notificationData);
      }

      // Prepare FCM message
      const message = {
        notification: {
          title,
          body
        },
        data: {
          type,
          ...data,
          timestamp: new Date().toISOString()
        },
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'lead_notifications'
          }
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1
            }
          }
        }
      };

      // Send to each device
      const results = [];
      for (const device of devices) {
        try {
          message.token = device.device_token;
          const response = await firebaseAdmin.messaging().send(message);
          results.push({ device_id: device.id, success: true, messageId: response });
          
          // Log successful notification
          await this.logNotification(agencyId, device.id, type, 'success', title);
        } catch (error) {
          logger.error(`Error sending to device ${device.id}:`, error);
          results.push({ device_id: device.id, success: false, error: error.message });
          
          // Log failed notification
          await this.logNotification(agencyId, device.id, type, 'failed', title, error.message);
          
          // Remove invalid tokens
          if (error.code === 'messaging/invalid-registration-token' || 
              error.code === 'messaging/registration-token-not-registered') {
            await this.removeInvalidToken(device.id);
          }
        }
      }

      const successCount = results.filter(r => r.success).length;

      return {
        success: successCount > 0,
        message: `Sent ${successCount} of ${devices.length} notifications`,
        sentCount: successCount,
        totalDevices: devices.length,
        results
      };

    } catch (error) {
      logger.error('Error in sendPushNotification:', error);
      throw error;
    }
  }

  /**
   * Send notification when lead is assigned
   * @param {string} agencyId - Agency UUID
   * @param {string} leadId - Lead UUID
   * @param {Object} leadData - Lead information
   */
  async notifyLeadAssigned(agencyId, leadId, leadData = {}) {
    try {
      const leadName = leadData.lead_name || leadData.name || 'New Lead';
      const location = leadData.city || leadData.zipcode || 'your area';
      
      return await this.sendPushNotification(agencyId, {
        title: '🎯 New Lead Assigned!',
        body: `${leadName} in ${location} has been assigned to you`,
        type: 'lead_assigned',
        data: {
          lead_id: leadId,
          lead_name: leadName,
          city: leadData.city,
          zipcode: leadData.zipcode,
          industry: leadData.industry_type || leadData.industry,
          action: 'view_lead'
        }
      });
    } catch (error) {
      logger.error('Error in notifyLeadAssigned:', error);
      // Don't throw - notification failure shouldn't break lead assignment
      return { success: false, error: error.message };
    }
  }

  /**
   * Send subscription-related notification
   * @param {string} agencyId - Agency UUID
   * @param {string} type - Notification type
   * @param {Object} subscriptionData - Subscription information
   */
  async notifySubscriptionChange(agencyId, type, subscriptionData = {}) {
    try {
      const messages = {
        activated: {
          title: '✅ Subscription Activated',
          body: `Your ${subscriptionData.plan_name || 'subscription'} is now active!`
        },
        cancelled: {
          title: '📋 Subscription Cancelled',
          body: `Your subscription has been cancelled. Access until ${subscriptionData.end_date || 'end of billing period'}.`
        },
        expiring: {
          title: '⚠️ Subscription Expiring Soon',
          body: `Your subscription expires on ${subscriptionData.end_date || 'soon'}. Renew to continue service.`
        },
        payment_failed: {
          title: '💳 Payment Failed',
          body: 'Your payment could not be processed. Please update your payment method.'
        }
      };

      const message = messages[type] || {
        title: 'Subscription Update',
        body: 'Your subscription has been updated.'
      };

      return await this.sendPushNotification(agencyId, {
        ...message,
        type: `subscription_${type}`,
        data: {
          subscription_id: subscriptionData.subscription_id,
          plan_id: subscriptionData.plan_id,
          action: 'view_subscription'
        }
      });
    } catch (error) {
      logger.error('Error in notifySubscriptionChange:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Queue notification when FCM is not available
   * @private
   */
  async queueNotification(agencyId, notificationData) {
    try {
      const { data, error } = await supabase
        .from('push_notifications')
        .insert([{
          agency_id: agencyId,
          title: notificationData.title,
          body: notificationData.body,
          type: notificationData.type || 'general',
          data: notificationData.data || {},
          status: 'pending',
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;

      logger.info(`Notification queued for agency ${agencyId}`);
      
      return {
        success: true,
        message: 'Notification queued (FCM not configured)',
        queued: true,
        notification_id: data.id
      };
    } catch (error) {
      logger.error('Error queueing notification:', error);
      throw error;
    }
  }

  /**
   * Log notification to database
   * @private
   */
  async logNotification(agencyId, deviceId, type, status, title, error = null) {
    try {
      await supabase
        .from('push_notifications')
        .insert([{
          agency_id: agencyId,
          device_id: deviceId,
          type,
          title,
          status,
          error_message: error,
          sent_at: status === 'success' ? new Date().toISOString() : null,
          created_at: new Date().toISOString()
        }]);
    } catch (err) {
      logger.error('Error logging notification:', err);
      // Don't throw - logging failure shouldn't break notification
    }
  }

  /**
   * Remove invalid device token
   * @private
   */
  async removeInvalidToken(deviceId) {
    try {
      await supabase
        .from('agency_devices')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', deviceId);
      
      logger.info(`Deactivated invalid device token: ${deviceId}`);
    } catch (error) {
      logger.error('Error removing invalid token:', error);
    }
  }

  /**
   * Get Firebase Admin instance
   * @private
   */
  getFirebaseAdmin() {
    try {
      // Check if Firebase is configured
      if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        return null;
      }

      // Lazy load firebase-admin
      if (!this.firebaseAdmin) {
        const admin = require('firebase-admin');
        
        if (!admin.apps.length) {
          const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
          });
        }
        
        this.firebaseAdmin = admin;
      }

      return this.firebaseAdmin;
    } catch (error) {
      logger.warn('Firebase not configured:', error.message);
      return null;
    }
  }

  /**
   * Process queued notifications (for background job)
   */
  async processQueuedNotifications(limit = 50) {
    try {
      const { data: notifications, error } = await supabase
        .from('push_notifications')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(limit);

      if (error) throw error;

      const firebaseAdmin = this.getFirebaseAdmin();
      if (!firebaseAdmin) {
        logger.warn('Cannot process queue: Firebase not configured');
        return { processed: 0, skipped: notifications?.length || 0 };
      }

      let processed = 0;
      for (const notification of notifications || []) {
        try {
          // Get device tokens for agency
          const { data: devices } = await supabase
            .from('agency_devices')
            .select('device_token')
            .eq('agency_id', notification.agency_id)
            .eq('push_enabled', true)
            .eq('is_active', true);

          if (!devices || devices.length === 0) {
            await supabase
              .from('push_notifications')
              .update({ status: 'skipped', updated_at: new Date().toISOString() })
              .eq('id', notification.id);
            continue;
          }

          // Send notification
          for (const device of devices) {
            await firebaseAdmin.messaging().send({
              token: device.device_token,
              notification: {
                title: notification.title,
                body: notification.body
              },
              data: {
                type: notification.type,
                ...notification.data
              }
            });
          }

          await supabase
            .from('push_notifications')
            .update({ 
              status: 'sent', 
              sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', notification.id);

          processed++;
        } catch (error) {
          logger.error(`Error processing notification ${notification.id}:`, error);
          await supabase
            .from('push_notifications')
            .update({ 
              status: 'failed', 
              error_message: error.message,
              updated_at: new Date().toISOString()
            })
            .eq('id', notification.id);
        }
      }

      return { processed, total: notifications?.length || 0 };
    } catch (error) {
      logger.error('Error processing queued notifications:', error);
      throw error;
    }
  }
}

module.exports = new NotificationService();

