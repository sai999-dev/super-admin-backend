// routes/mobileNotificationsRoutes.js
const express = require("express");
const router = express.Router();
const admin = require("firebase-admin");
const { authenticateAgency } = require("../middleware/agencyAuth");
const supabase = require("../config/supabaseClient");

// Save FCM Token
// PUBLIC: Save Web / Mobile device token
router.post("/save-device-token", async (req, res) => {
  try {
    const { token, platform, agency_id } = req.body;

    if (!token) return res.status(400).json({ success: false, message: "token is required" });
    if (!agency_id) return res.status(400).json({ success: false, message: "agency_id is required" });

    console.log("💾 Inserting device token", { token, platform, agency_id });

    const { error } = await supabase.from("agency_devices").insert([
      {
        agency_id,
        device_token: token,
        platform: platform || "web",
        device_type: platform || "web",
        is_active: true,
        push_enabled: true,
        created_at: new Date().toISOString(),
        last_seen: new Date().toISOString(),
      },
    ]);

    if (error) {
      console.error("❌ Insert error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to save device token",
        error: error.message,
      });
    }

    return res.json({ success: true, message: "Device token saved successfully" });

  } catch (err) {
    console.error("❌ save-device-token error:", err);
    return res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
});



// Send notification manually (for testing)
router.post("/send-test", async (req, res) => {
  try {
    const { fcmToken, title, body } = req.body;

    const message = {
      token: fcmToken,
      notification: { title, body },
      android: { priority: "high" },
    };

    const response = await admin.messaging().send(message);

    res.json({ success: true, messageId: response });
  } catch (err) {
    console.error("Error sending test notification:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
