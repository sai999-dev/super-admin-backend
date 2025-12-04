const supabase = require("../config/supabaseClient");
const admin = require("../config/firebaseAdmin");

async function sendLeadNotification(agencyId, leadName) {
  console.log(`🔔 Preparing push notification for agency ${agencyId}`);

  const { data, error } = await supabase
    .from("agencies")
    .select("fcm_token")
    .eq("id", agencyId)
    .single();

  if (error || !data || !data.fcm_token) {
    console.log("⚠️ No FCM token for agency:", agencyId);
    return;
  }

  const message = {
    token: data.fcm_token,
    notification: {
      title: "New Lead Assigned!",
      body: `${leadName} has been assigned to you.`,
    },
    android: {
      priority: "high",
    },
  };

  try {
    await admin.messaging().send(message);
    console.log("🚀 Notification sent to agency", agencyId);
  } catch (err) {
    console.error("❌ FCM send error:", err);
  }
}

module.exports = sendLeadNotification;
