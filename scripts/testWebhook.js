/**
 * Test webhook endpoint with sample data
 */

const fetch = require('node-fetch');

async function testWebhook() {
  const webhookUrl = 'http://localhost:3000/api/webhooks/local-backend-1762278750d';
  const apiKey = 'prt_live_65437d1979e559cb9185d46c1adccb3a';

  const testData = {
    name: 'Test User',
    email: 'test@example.com',
    phone: '5551234567',
    city: 'New York',
    state: 'NY',
    zipcode: '10001',
    address: '123 Test Street'
  };

  console.log('🧪 Testing webhook endpoint...\n');
  console.log('URL:', webhookUrl);
  console.log('Data:', JSON.stringify(testData, null, 2));
  console.log('');

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      },
      body: JSON.stringify(testData)
    });

    const result = await response.json();

    console.log('Response Status:', response.status);
    console.log('Response Body:', JSON.stringify(result, null, 2));

    if (response.ok && result.success) {
      console.log('\n✅ Webhook test successful!');
      console.log(`   Lead ID: ${result.data?.lead_id}`);
      if (result.data?.assigned_to_agency) {
        console.log(`   Assigned to: ${result.data.assigned_to_agency}`);
      }
    } else {
      console.log('\n❌ Webhook test failed!');
      console.log('   Error:', result.message || 'Unknown error');
    }

  } catch (error) {
    console.error('\n❌ Error testing webhook:', error.message);
    console.log('\n💡 Make sure:');
    console.log('   1. Backend server is running (node server.js)');
    console.log('   2. Server is listening on port 3000');
    console.log('   3. Database connection is configured');
  }
}

testWebhook();


