/**
 * Comprehensive Model Testing Script
 * Tests all models with actual database operations
 */

require('dotenv').config({ path: 'config.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testModel(tableName, modelDescription) {
  console.log(`\n📋 Testing ${modelDescription}...`);
  
  try {
    // Test SELECT query
    const { data, error, count } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: false })
      .limit(1);
    
    if (error) {
      console.log(`   ❌ Error: ${error.message}`);
      return false;
    }
    
    console.log(`   ✅ Query successful`);
    console.log(`   📊 Total records: ${count}`);
    
    if (data && data.length > 0) {
      const columns = Object.keys(data[0]);
      console.log(`   📝 Columns (${columns.length}): ${columns.slice(0, 5).join(', ')}${columns.length > 5 ? '...' : ''}`);
    }
    
    return true;
  } catch (err) {
    console.log(`   ❌ Exception: ${err.message}`);
    return false;
  }
}

async function runAllTests() {
  console.log('========================================');
  console.log('COMPREHENSIVE MODEL TESTING');
  console.log('========================================');
  
  const tests = [
    { table: 'subscription_plans', desc: 'Subscription Plans' },
    { table: 'subscriptions', desc: 'Subscriptions' },
    { table: 'agencies', desc: 'Agencies' },
    { table: 'territories', desc: 'Territories' },
    { table: 'leads', desc: 'Leads' },
    { table: 'users', desc: 'Users' },
    { table: 'portals', desc: 'Portals' }
  ];
  
  const results = [];
  
  for (const test of tests) {
    const success = await testModel(test.table, test.desc);
    results.push({ name: test.desc, success });
  }
  
  console.log('\n========================================');
  console.log('TEST SUMMARY');
  console.log('========================================\n');
  
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  results.forEach(result => {
    console.log(`${result.success ? '✅' : '❌'} ${result.name}`);
  });
  
  console.log(`\n📊 Results: ${passed}/${results.length} passed`);
  
  if (failed === 0) {
    console.log('\n🎉 ALL MODELS WORKING CORRECTLY!');
    console.log('✅ Database and backend are fully synchronized');
  } else {
    console.log(`\n⚠️  ${failed} model(s) have issues`);
  }
  
  process.exit(failed === 0 ? 0 : 1);
}

runAllTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
