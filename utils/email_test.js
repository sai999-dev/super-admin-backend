// super-admin-backend/utils/email_test.js
const { sendVerificationCode } = require('../services/emailService');

async function runTest() {
  try {
    const info = await sendVerificationCode(process.env.DEV_TEST_EMAIL || 'theajey001@gmail.com', '123456');
    console.log('TEST sendMail info:', {
      accepted: info.accepted,
      rejected: info.rejected,
      response: info.response,
      messageId: info.messageId
    });
  } catch (err) {
    console.error('TEST sendMail error:', err);
  }
}
runTest();
