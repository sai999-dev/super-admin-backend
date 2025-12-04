/**
 * Test Script for Webhook to Unified Leads
 * Tests the webhook endpoint with the provided credentials
 */

const webhookUrl = 'https://super-admin-backend-2sy0.onrender.com/api/webhooks/webhooktesting';
const apiKey = 'prt_live_252e0393ecd6ea6e86a25f4170531b28';

// Test data examples
const testPayloads = [
  // Test 1: Standard field names
  {
    name: 'John Doe',
    email: 'john@example.com',
    phone: '555-123-4567',
    city: 'New York',
    state: 'NY',
    zipcode: '10001'
  },
  // Test 2: Different field names (will be mapped)
  {
    full_name: 'Jane Smith',
    email_address: 'jane@example.com',
    contact_no: '555-987-6543',
    budget: 5000,
    service_type: 'Home Health'
  },
  // Test 3: Mixed field names
  {
    name: 'Bob Johnson',
    email: 'bob@example.com',
    phone_number: '555-111-2222',
    location: 'Los Angeles',
    budget: 3000
  }
];

async function testWebhook(payload, testNumber) {
  try {
    console.log(`\n🧪 Test ${testNumber}:`);
    console.log('📤 Sending payload:', JSON.stringify(payload, null, 2));
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    
    console.log(`📥 Response Status: ${response.status}`);
    console.log('📥 Response:', JSON.stringify(result, null, 2));
    
    if (response.ok && result.success) {
      console.log(`✅ Test ${testNumber} PASSED!`);
      console.log(`   Lead ID: ${result.data?.lead_id}`);
      return true;
    } else {
      console.log(`❌ Test ${testNumber} FAILED!`);
      console.log(`   Error: ${result.message}`);
      if (result.errors) {
        console.log(`   Errors: ${result.errors.join(', ')}`);
      }
      return false;
    }
  } catch (error) {
    console.error(`❌ Test ${testNumber} ERROR:`, error.message);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Testing Webhook to Unified Leads');
  console.log('=====================================');
  console.log(`Webhook URL: ${webhookUrl}`);
  console.log(`API Key: ${apiKey.substring(0, 20)}...`);
  
  const results = [];
  
  for (let i = 0; i < testPayloads.length; i++) {
    const success = await testWebhook(testPayloads[i], i + 1);
    results.push(success);
    // Wait a bit between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n📊 Test Results:');
  console.log(`✅ Passed: ${results.filter(r => r).length}/${results.length}`);
  console.log(`❌ Failed: ${results.filter(r => !r).length}/${results.length}`);
}

// Run tests if executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { testWebhook, runTests };


