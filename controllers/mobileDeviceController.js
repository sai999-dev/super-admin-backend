/**
 * Mobile Device Controller
 * Handles device registration for push notifications
 */

const supabase = require('../config/supabaseClient');

/**
 * POST /api/mobile/auth/register-device
 * Register device for push notifications
 */
async function registerDevice(req, res) {
  try {
    const agencyId = req.agency.id;
    const { device_token, platform, device_model, app_version } = req.body;

    if (!device_token) {
      return res.status(400).json({
        success: false,
        message: 'Device token is required'
      });
    }

    if (!platform || !['ios', 'android'].includes(platform)) {
      return res.status(400).json({
        success: false,
        message: 'Platform must be "ios" or "android"'
      });
    }

    // Insert or update device
    const deviceData = {
      agency_id: agencyId,
      device_token,
      platform,
      device_model: device_model || null,
      app_version: app_version || null,
      is_active: true,
      last_seen: new Date().toISOString()
    };

    // Use upsert to handle conflict
    const { data, error } = await supabase
      .from('agency_devices')
      .upsert(deviceData, {
        onConflict: 'agency_id,device_token',
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (error) {
      // If upsert doesn't work, try insert then update
      const { data: existing } = await supabase
        .from('agency_devices')
        .select('*')
        .eq('agency_id', agencyId)
        .eq('device_token', device_token)
        .single();

      if (existing) {
        const { data: updated, error: updateError } = await supabase
          .from('agency_devices')
          .update({
            platform,
            device_model: device_model || existing.device_model,
            app_version: app_version || existing.app_version,
            is_active: true,
            last_seen: new Date().toISOString()
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (updateError) throw updateError;
        return res.json({
          success: true,
          message: 'Device updated successfully',
          data: updated
        });
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from('agency_devices')
          .insert(deviceData)
          .select()
          .single();

        if (insertError) throw insertError;
        return res.json({
          success: true,
          message: 'Device registered successfully',
          data: inserted
        });
      }
    }

    res.json({
      success: true,
      message: 'Device registered successfully',
      data
    });
  } catch (error) {
    console.error('Error registering device:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register device',
      error: error.message
    });
  }
}

/**
 * PUT /api/mobile/auth/update-device
 * Update device token when it changes
 */
async function updateDevice(req, res) {
  try {
    const agencyId = req.agency.id;
    const { device_token, app_version } = req.body;

    if (!device_token) {
      return res.status(400).json({
        success: false,
        message: 'Device token is required'
      });
    }

    // Find device by agency_id and old token (if provided)
    const { device_token: old_token } = req.body;
    
    let device = null;
    if (old_token) {
      const { data } = await supabase
        .from('agency_devices')
        .select('*')
        .eq('agency_id', agencyId)
        .eq('device_token', old_token)
        .single();
      device = data;
    }

    // If not found by old token, try to find any device for this agency
    if (!device) {
      const { data: devices } = await supabase
        .from('agency_devices')
        .select('*')
        .eq('agency_id', agencyId)
        .eq('is_active', true)
        .limit(1);
      
      if (devices && devices.length > 0) {
        device = devices[0];
      }
    }

    if (device) {
      // Update existing device
      const { data: updated, error: updateError } = await supabase
        .from('agency_devices')
        .update({
          device_token,
          app_version: app_version || device.app_version,
          last_seen: new Date().toISOString(),
          is_active: true
        })
        .eq('id', device.id)
        .select()
        .single();

      if (updateError) throw updateError;

      return res.json({
        success: true,
        message: 'Device updated successfully',
        data: updated
      });
    } else {
      // Create new device (device model and platform from JWT or use defaults)
      const { data: inserted, error: insertError } = await supabase
        .from('agency_devices')
        .insert({
          agency_id: agencyId,
          device_token,
          platform: 'ios', // Default, should be provided in request
          app_version: app_version || null,
          is_active: true,
          last_seen: new Date().toISOString()
        })
        .select()
        .single();

      if (insertError) throw insertError;

      return res.json({
        success: true,
        message: 'Device created successfully',
        data: inserted
      });
    }
  } catch (error) {
    console.error('Error updating device:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update device',
      error: error.message
    });
  }
}

/**
 * DELETE /api/mobile/auth/unregister-device
 * Unregister device on logout
 */
async function unregisterDevice(req, res) {
  try {
    const agencyId = req.agency.id;
    const { device_token } = req.body;

    if (!device_token) {
      return res.status(400).json({
        success: false,
        message: 'Device token is required'
      });
    }

    // Soft delete (set is_active = false)
    const { error: updateError } = await supabase
      .from('agency_devices')
      .update({
        is_active: false,
        last_seen: new Date().toISOString()
      })
      .eq('agency_id', agencyId)
      .eq('device_token', device_token);

    if (updateError) {
      // If soft delete fails, try hard delete
      const { error: deleteError } = await supabase
        .from('agency_devices')
        .delete()
        .eq('agency_id', agencyId)
        .eq('device_token', device_token);

      if (deleteError) throw deleteError;
    }

    res.json({
      success: true,
      message: 'Device unregistered successfully'
    });
  } catch (error) {
    console.error('Error unregistering device:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unregister device',
      error: error.message
    });
  }
}

module.exports = {
  registerDevice,
  updateDevice,
  unregisterDevice
};

