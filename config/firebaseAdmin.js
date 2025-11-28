const admin = require("firebase-admin");

// Ensure the environment variable exists
if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  console.error("❌ FIREBASE_SERVICE_ACCOUNT_KEY is missing");
  throw new Error("Firebase Admin service account not found in environment variables");
}

// Parse the key from the environment variable
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

console.log("🔥 Firebase Admin initialized successfully");

module.exports = admin;
