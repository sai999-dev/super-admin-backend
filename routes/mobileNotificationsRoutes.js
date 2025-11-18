// routes/mobileNotificationsRoutes.js
const express = require("express");
const router = express.Router();
const admin = require("firebase-admin");
const { authenticateAgency } = require("../middleware/agencyAuth");
const supabase = require("../config/supabaseClient");

// Save FCM Token
router.post("/save-device-token", authenticateAgency, async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, message: "Token missing" });
    }

    const agencyId = req.agency.id;

    const { error } = await supabase
      .from("agencies")
      .update({ fcm_token: token })
      .eq("id", agencyId);

    if (error) {
      console.error("Supabase update error:", error);
      return res
        .status(500)
        .json({ success: false, message: "Failed to save token" });
    }

    return res.json({
      success: true,
      message: "FCM token saved successfully",
    });
  } catch (err) {
    console.error("Token save error:", err);
    return res.status(500).json({ success: false, message: err.message });
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
