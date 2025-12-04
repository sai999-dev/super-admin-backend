// SEND TEST PUSH NOTIFICATION
// Run it using:  node scripts/sendTestNotification.js <agency_id>

const notificationService = require('../services/notificationService');

async function sendTest() {
  const agencyId = process.argv[2];

  if (!agencyId) {
    console.error("❌ Usage: node sendTestNotification.js <agency_id>");
    process.exit(1);
  }

  console.log("🚀 Sending test notification to agency:", agencyId);

  try {
    const result = await notificationService.sendPushNotification(agencyId, {
      title: "🔥 Test Notification",
      body: "This is a test push notification from backend!",
      type: "test_notification",
      data: {
        action: "open_dashboard",
        test: "true"
      }
    });

    console.log("\n📩 RESULT:");
    console.log(JSON.stringify(result, null, 2));

    console.log("\n✅ Test Completed");
  } catch (err) {
    console.error("\n❌ ERROR:");
    console.error(err);
  }
}

sendTest();
