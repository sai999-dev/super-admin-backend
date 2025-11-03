/**
 * Mobile Notification Controller
 * Handles notification settings for agencies
 */

const supabase = require('../config/supabaseClient');

/**
 * GET /api/mobile/notifications/settings
 * Get notification preferences
 */
async function getSettings(req, res) {
  try {
    const agencyId = req.agency.id;

    // Query notification settings
    const { data: settings, error } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('agency_id', agencyId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      throw error;
    }

    // Return defaults if not found
    if (!settings) {
      return res.json({
        success: true,
        data: {
          push_enabled: true,
          email_enabled: true,
          sms_enabled: false,
          sound_enabled: true,
          vibration_enabled: true,
          quiet_hours: null,
          notification_types: ['lead_assigned', 'subscription_expiring']
        }
      });
    }

    // Parse JSON fields
    const result = {
      push_enabled: settings.push_enabled ?? true,
      email_enabled: settings.email_enabled ?? true,
      sms_enabled: settings.sms_enabled ?? false,
      sound_enabled: settings.sound_enabled ?? true,
      vibration_enabled: settings.vibration_enabled ?? true,
      quiet_hours: typeof settings.quiet_hours === 'string' 
        ? JSON.parse(settings.quiet_hours) 
        : settings.quiet_hours,
      notification_types: Array.isArray(settings.notification_types)
        ? settings.notification_types
        : ['lead_assigned', 'subscription_expiring']
    };

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching notification settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notification settings',
      error: error.message
    });
  }
}

/**
 * PUT /api/mobile/notifications/settings
 * Update notification preferences
 */
async function updateSettings(req, res) {
  try {
    const agencyId = req.agency.id;
    const {
      push_enabled,
      email_enabled,
      sms_enabled,
      sound_enabled,
      vibration_enabled,
      quiet_hours,
      notification_types
    } = req.body;

    // Prepare update data (only include provided fields)
    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (push_enabled !== undefined) updateData.push_enabled = push_enabled;
    if (email_enabled !== undefined) updateData.email_enabled = email_enabled;
    if (sms_enabled !== undefined) updateData.sms_enabled = sms_enabled;
    if (sound_enabled !== undefined) updateData.sound_enabled = sound_enabled;
    if (vibration_enabled !== undefined) updateData.vibration_enabled = vibration_enabled;
    
    if (quiet_hours !== undefined) {
      updateData.quiet_hours = typeof quiet_hours === 'object'
        ? quiet_hours
        : quiet_hours;
    }
    
    if (notification_types !== undefined) {
      updateData.notification_types = Array.isArray(notification_types)
        ? notification_types
        : notification_types;
    }

    // Check if settings exist
    const { data: existing } = await supabase
      .from('notification_settings')
      .select('id')
      .eq('agency_id', agencyId)
      .single();

    let result;
    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from('notification_settings')
        .update(updateData)
        .eq('agency_id', agencyId)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Create new
      const { data, error } = await supabase
        .from('notification_settings')
        .insert({
          agency_id: agencyId,
          push_enabled: push_enabled ?? true,
          email_enabled: email_enabled ?? true,
          sms_enabled: sms_enabled ?? false,
          sound_enabled: sound_enabled ?? true,
          vibration_enabled: vibration_enabled ?? true,
          quiet_hours: quiet_hours || null,
          notification_types: notification_types || ['lead_assigned', 'subscription_expiring'],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    // Parse JSON fields for response
    const response = {
      push_enabled: result.push_enabled ?? true,
      email_enabled: result.email_enabled ?? true,
      sms_enabled: result.sms_enabled ?? false,
      sound_enabled: result.sound_enabled ?? true,
      vibration_enabled: result.vibration_enabled ?? true,
      quiet_hours: typeof result.quiet_hours === 'string'
        ? JSON.parse(result.quiet_hours)
        : result.quiet_hours,
      notification_types: Array.isArray(result.notification_types)
        ? result.notification_types
        : ['lead_assigned', 'subscription_expiring']
    };

    res.json({
      success: true,
      message: 'Notification settings updated successfully',
      data: response
    });
  } catch (error) {
    console.error('Error updating notification settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update notification settings',
      error: error.message
    });
  }
}

module.exports = {
  getSettings,
  updateSettings
};

