/**
 * Notification Service
 * Handles push notifications via Firebase Cloud Messaging (FCM)
 */

const supabase = require('../config/supabaseClient');
const logger = require('../utils/logger');

class NotificationService {
  /**
   * Send push notification to agency
   */
  async sendPushNotification(agencyId, notificationData) {
    try {
      const { title, body, type = 'general', data = {} } = notificationData;

      if (!title || !body) {
        throw new Error("Title and body are required for notifications");
      }

      // Fetch all agency devices
      const { data: devices, error } = await supabase
        .from("agency_devices")
        .select("id, device_token, device_type, push_enabled, is_active")
        .eq("agency_id", agencyId)
        .eq("push_enabled", true)
        .eq("is_active", true);

      if (error) {
        logger.error("Error fetching devices:", error);
        throw error;
      }

      if (!devices || devices.length === 0) {
        logger.warn(`No active devices found for agency ${agencyId}`);
        return {
          success: false,
          message: "No active devices found for agency",
          sentCount: 0,
        };
      }

      const admin = this.getFirebaseAdmin();
      if (!admin) {
        logger.warn("Firebase Admin missing. Saving to queue...");
        return await this.queueNotification(agencyId, notificationData);
      }

      const results = [];

      for (const device of devices) {
        const message = this.buildMessagePayload(device, title, body, type, data);

        try {
          const response = await admin.messaging().send(message);

          results.push({ device_id: device.id, success: true, response });
          await this.logNotification(agencyId, device.id, type, "success", title);
        } catch (err) {
          results.push({
            device_id: device.id,
            success: false,
            error: err.message,
          });

          await this.logNotification(agencyId, device.id, type, "failed", title, err.message);

          if (
            err.code === "messaging/invalid-registration-token" ||
            err.code === "messaging/registration-token-not-registered"
          ) {
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
        results,
      };

    } catch (err) {
      logger.error("Error sending notification:", err);
      throw err;
    }
  }

  /**
   * Build FCM Payload based on device type (android, ios, web)
   */
  buildMessagePayload(device, title, body, type, data) {
    const basePayload = {
      notification: { title, body },
      data: {
        type,
        ...data,
        timestamp: new Date().toISOString(),
      },
      token: device.device_token,
    };

    if (device.device_type === "web") {
      return {
        ...basePayload,
        webpush: {
          notification: {
            title,
            body,
            icon: "/icons/icon-192.png",
            badge: "/icons/badge.png",
            requireInteraction: true,
            tag: "lead-notification",
          },
          fcmOptions: {
            link: `http://localhost:21193/leads/${data.lead_id}`,  // ✅ Your local port
          },
        },
      };
    }

    if (device.device_type === "ios") {
      return {
        ...basePayload,
        apns: {
          payload: {
            aps: {
              alert: { title, body },
              sound: "default",
              badge: 1,
            },
          },
        },
      };
    }

    // ANDROID (default)
    return {
      ...basePayload,
      android: {
        priority: "high",
        notification: {
          sound: "default",
          channelId: "lead_notifications",
        },
      },
    };
  }

  /**
   * Notify when lead assigned
   */
  async notifyLeadAssigned(agencyId, leadId, leadData = {}) {
    try {
      const leadName = leadData.lead_name || "New Lead";
      const location = leadData.city || leadData.zipcode || "your area";

      return await this.sendPushNotification(agencyId, {
        title: "🎯 New Lead Assigned!",
        body: `${leadName} in ${location} has been assigned to you`,
        type: "lead_assigned",
        data: {
          lead_id: leadId,
          lead_name: leadName,
          city: leadData.city,
          zipcode: leadData.zipcode,
          action: "view_lead",
        },
      });
    } catch (err) {
      logger.error("notifyLeadAssigned error:", err);
      return { success: false };
    }
  }

  /**
   * Log notification
   */
  async logNotification(agencyId, deviceId, type, status, title, error = null) {
    try {
      await supabase.from("push_notifications").insert({
        agency_id: agencyId,
        device_id: deviceId,
        type,
        title,
        status,
        error_message: error,
        sent_at: status === "success" ? new Date().toISOString() : null,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      logger.error("Failed to log notification:", err);
    }
  }

  /**
   * Remove invalid tokens
   */
  async removeInvalidToken(deviceId) {
    await supabase
      .from("agency_devices")
      .update({ is_active: false })
      .eq("id", deviceId);
  }

  /**
   * Queue notification
   */
  async queueNotification(agencyId, notificationData) {
    await supabase.from("push_notifications").insert({
      agency_id: agencyId,
      ...notificationData,
      status: "pending",
      created_at: new Date().toISOString(),
    });
    return { queued: true };
  }

  /**
   * Firebase Admin
   */
  getFirebaseAdmin() {
    try {
      if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) return null;

      if (!this.firebaseAdmin) {
        const admin = require("firebase-admin");
        const credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

        if (!admin.apps.length) {
          admin.initializeApp({
            credential: admin.credential.cert(credentials),
          });
        }

        this.firebaseAdmin = admin;
      }

      return this.firebaseAdmin;
    } catch (err) {
      logger.warn("Firebase init failed:", err.message);
      return null;
    }
  }
}

module.exports = new NotificationService();
