/**
 * Test All API Endpoints End-to-End
 * Tests critical endpoints with live database data
 */

const { createClient } = require('@supabase/supabase-js');
const http = require('http');

const SUPABASE_URL = 'https://ioqjonxjptvshdwhbuzv.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvcWpvbnhqcHR2c2hkd2hidXp2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTQ4MzQyNSwiZXhwIjoyMDc3MDU5NDI1fQ.ncz4UBVevblo9BGNhSezwYGpFopuyyhfYahtd__2eIs';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

console.log('🧪 Testing All Endpoints End-to-End...\n');

async function testDatabaseOperations() {
  console.log('📊 Testing Database Operations:\n');
  
  // Test 1: Get agencies
  console.log('1️⃣ Testing GET agencies...');
  const { data: agencies, error: agenciesError } = await supabase
    .from('agencies')
    .select('*')
    .limit(5);
  
  if (agenciesError) {
    console.log(`   ❌ Error: ${agenciesError.message}`);
  } else {
    console.log(`   ✅ Success! Found ${agencies.length} agencies`);
  }
  
  // Test 2: Get subscriptions
  console.log('\n2️⃣ Testing GET subscriptions...');
  const { data: subscriptions, error: subError } = await supabase
    .from('subscriptions')
    .select('*, agencies(*), subscription_plans(*)')
    .limit(5);
  
  if (subError) {
    console.log(`   ❌ Error: ${subError.message}`);
  } else {
    console.log(`   ✅ Success! Found ${subscriptions.length} subscriptions`);
  }
  
  // Test 3: Get portals
  console.log('\n3️⃣ Testing GET portals...');
  const { data: portals, error: portalsError } = await supabase
    .from('portals')
    .select('*')
    .limit(5);
  
  if (portalsError) {
    console.log(`   ❌ Error: ${portalsError.message}`);
  } else {
    console.log(`   ✅ Success! Found ${portals.length} portals`);
  }
  
  // Test 4: Get leads
  console.log('\n4️⃣ Testing GET leads...');
  const { data: leads, error: leadsError } = await supabase
    .from('leads')
    .select('*')
    .limit(5);
  
  if (leadsError) {
    console.log(`   ❌ Error: ${leadsError.message}`);
  } else {
    console.log(`   ✅ Success! Found ${leads.length} leads`);
  }
  
  // Test 5: Get audit logs
  console.log('\n5️⃣ Testing GET audit_logs...');
  const { data: auditLogs, error: auditError } = await supabase
    .from('audit_logs')
    .select('*')
    .limit(5)
    .order('created_at', { ascending: false });
  
  if (auditError) {
    console.log(`   ❌ Error: ${auditError.message}`);
  } else {
    console.log(`   ✅ Success! Found ${auditLogs.length} recent audit logs`);
  }
  
  // Test 6: Test relationships
  console.log('\n6️⃣ Testing table relationships...');
  
  if (agencies && agencies.length > 0) {
    const agencyId = agencies[0].id;
    
    // Check subscriptions for this agency
    const { data: agencySubs, error: agencySubsError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('agency_id', agencyId);
    
    if (!agencySubsError) {
      console.log(`   ✅ Agency ${agencyId} has ${agencySubs.length} subscriptions`);
    }
    
    // Check territories for this agency
    const { data: agencyTerr, error: agencyTerrError } = await supabase
      .from('territories')
      .select('*')
      .eq('agency_id', agencyId);
    
    if (!agencyTerrError) {
      console.log(`   ✅ Agency ${agencyId} has ${agencyTerr.length} territories`);
    }
  }
  
  return {
    agencies: agencies?.length || 0,
    subscriptions: subscriptions?.length || 0,
    portals: portals?.length || 0,
    leads: leads?.length || 0,
    auditLogs: auditLogs?.length || 0
  };
}

async function testServerEndpoints() {
  console.log('\n🌐 Testing Server Endpoints:\n');
  
  const baseUrl = 'http://localhost:3000';
  const endpoints = [
    { path: '/api/health', method: 'GET', name: 'Health Check' },
    { path: '/api/database/tables', method: 'GET', name: 'Database Tables' },
    { path: '/api/admin/auth/login', method: 'POST', name: 'Admin Login (needs body)' },
  ];
  
  for (const endpoint of endpoints) {
    if (endpoint.method === 'POST' && endpoint.path.includes('login')) {
      console.log(`⏭️  Skipping ${endpoint.name} (requires body)`);
      continue;
    }
    
    try {
      const result = await testEndpoint(baseUrl + endpoint.path, endpoint.method);
      if (result.success) {
        console.log(`   ✅ ${endpoint.name}: Working`);
      } else {
        console.log(`   ❌ ${endpoint.name}: ${result.error}`);
      }
    } catch (error) {
      console.log(`   ⚠️  ${endpoint.name}: Server not running or ${error.message}`);
    }
  }
}

function testEndpoint(url, method) {
  return new Promise((resolve) => {
    const req = http.request(url, { method, timeout: 2000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ success: json.success !== false, data: json });
        } catch (e) {
          resolve({ success: res.statusCode === 200, data });
        }
      });
    });
    
    req.on('error', (error) => {
      resolve({ success: false, error: error.message });
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'timeout' });
    });
    
    req.end();
  });
}

async function main() {
  const dbResults = await testDatabaseOperations();
  
  console.log(`\n${'='.repeat(70)}`);
  console.log('📊 Database Test Summary:');
  console.log(`${'='.repeat(70)}`);
  console.log(`   Agencies: ${dbResults.agencies}`);
  console.log(`   Subscriptions: ${dbResults.subscriptions}`);
  console.log(`   Portals: ${dbResults.portals}`);
  console.log(`   Leads: ${dbResults.leads}`);
  console.log(`   Audit Logs: ${dbResults.auditLogs}`);
  console.log(`${'='.repeat(70)}\n`);
  
  await testServerEndpoints();
  
  console.log('\n✅ End-to-end testing complete!\n');
  console.log('💡 Next steps:');
  console.log('   1. Run RLS migration in Supabase SQL Editor');
  console.log('   2. Start server: npm start');
  console.log('   3. Test API endpoints with Postman/curl');
  console.log('   4. Test mobile app integration\n');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

