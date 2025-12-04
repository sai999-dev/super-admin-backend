/**
 * Deep Schema Analysis Script
 * Analyzes subscription plans, zipcode allocations, and all table relationships
 */

require('dotenv').config({ path: 'config.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function analyzeTable(tableName) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📋 ANALYZING: ${tableName.toUpperCase()}`);
  console.log('='.repeat(60));
  
  try {
    // Get all columns by fetching one row
    const { data: sample, error: sampleError } = await supabase
      .from(tableName)
      .select('*')
      .limit(1);
    
    if (sampleError) throw sampleError;
    
    if (sample && sample.length > 0) {
      const columns = Object.keys(sample[0]);
      console.log(`\n📊 Total Columns: ${columns.length}`);
      console.log('📝 Column List:');
      columns.forEach((col, idx) => {
        const value = sample[0][col];
        const type = typeof value;
        const isNull = value === null;
        console.log(`   ${idx + 1}. ${col} (${isNull ? 'NULL' : type})`);
      });
    }
    
    // Get total count
    const { count, error: countError } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });
    
    if (!countError) {
      console.log(`\n📈 Total Records: ${count}`);
    }
    
    // Get sample data
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(2);
    
    if (!error && data && data.length > 0) {
      console.log('\n📄 Sample Record:');
      console.log(JSON.stringify(data[0], null, 2));
    }
    
    return { success: true, columns: sample && sample.length > 0 ? Object.keys(sample[0]) : [] };
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function analyzeSubscriptionPlans() {
  console.log('\n' + '='.repeat(60));
  console.log('💰 SUBSCRIPTION PLANS ANALYSIS');
  console.log('='.repeat(60));
  
  const { data: plans, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .order('price_per_unit', { ascending: true });
  
  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }
  
  console.log(`\n📊 Total Plans: ${plans.length}\n`);
  
  plans.forEach((plan, idx) => {
    console.log(`${idx + 1}. ${plan.name}`);
    console.log(`   💵 Price per ${plan.unit_type}: $${plan.price_per_unit}`);
    console.log(`   📦 Min Units: ${plan.min_units}`);
    console.log(`   📦 Max Units: ${plan.max_units}`);
    console.log(`   🔄 Billing: ${plan.billing_cycle}`);
    console.log(`   🎁 Trial Days: ${plan.trial_days}`);
    console.log(`   📋 Metadata:`, JSON.stringify(plan.metadata, null, 2));
    console.log('');
  });
  
  console.log('\n💡 INTERPRETATION:');
  console.log('   • Each plan allows purchasing 1-3 zipcodes (units)');
  console.log('   • max_units=3 means agency can buy UP TO 3 zipcodes');
  console.log('   • Each zipcode costs the price_per_unit amount');
  console.log('   • Example: Basic Plan = $99/zipcode, can buy 1-3 zipcodes');
}

async function analyzeAgencyZipcodes() {
  console.log('\n' + '='.repeat(60));
  console.log('🏢 AGENCY ZIPCODE ALLOCATION ANALYSIS');
  console.log('='.repeat(60));
  
  const { data: agencies, error } = await supabase
    .from('agencies')
    .select('id, agency_name, zipcodes, territories, territory_count, territory_limit, primary_zipcodes');
  
  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }
  
  console.log(`\n📊 Total Agencies: ${agencies.length}\n`);
  
  for (const agency of agencies) {
    console.log(`🏢 ${agency.agency_name}`);
    console.log(`   ID: ${agency.id}`);
    console.log(`   Zipcodes Array: ${JSON.stringify(agency.zipcodes)}`);
    console.log(`   Territory Count: ${agency.territory_count}`);
    console.log(`   Territory Limit: ${agency.territory_limit}`);
    console.log(`   Primary Zipcodes: ${JSON.stringify(agency.primary_zipcodes)}`);
    
    // Get actual territories from territories table
    const { data: territories } = await supabase
      .from('territories')
      .select('zipcode, type, value, is_active')
      .eq('agency_id', agency.id);
    
    if (territories && territories.length > 0) {
      console.log(`   Actual Territories (${territories.length}):`);
      territories.forEach(t => {
        console.log(`      • ${t.type}: ${t.value} (${t.zipcode}) - ${t.is_active ? 'Active' : 'Inactive'}`);
      });
    }
    console.log('');
  }
}

async function analyzeSubscriptionToTerritory() {
  console.log('\n' + '='.repeat(60));
  console.log('🔗 SUBSCRIPTION → TERRITORY MAPPING');
  console.log('='.repeat(60));
  
  const { data: subscriptions, error } = await supabase
    .from('subscriptions')
    .select('id, agency_id, plan_id, units_purchased, max_units, status')
    .limit(5);
  
  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }
  
  console.log(`\nAnalyzing ${subscriptions.length} subscriptions...\n`);
  
  for (const sub of subscriptions) {
    // Get plan details
    const { data: plan } = await supabase
      .from('subscription_plans')
      .select('name, price_per_unit, max_units')
      .eq('id', sub.plan_id)
      .single();
    
    // Get territories for this subscription
    const { data: territories } = await supabase
      .from('territories')
      .select('zipcode, value, is_active')
      .eq('subscription_id', sub.id);
    
    console.log(`📋 Subscription: ${sub.id.substring(0, 8)}...`);
    console.log(`   Plan: ${plan ? plan.name : 'Unknown'}`);
    console.log(`   Plan Max Units: ${plan ? plan.max_units : 'N/A'}`);
    console.log(`   Units Purchased: ${sub.units_purchased || 'Not set'}`);
    console.log(`   Subscription Max Units: ${sub.max_units || 'Not set'}`);
    console.log(`   Actual Territories: ${territories ? territories.length : 0}`);
    if (territories && territories.length > 0) {
      territories.forEach(t => {
        console.log(`      • ${t.value} (${t.zipcode})`);
      });
    }
    console.log('');
  }
}

async function checkFlutterAPIs() {
  console.log('\n' + '='.repeat(60));
  console.log('📱 FLUTTER API ENDPOINTS CHECK');
  console.log('='.repeat(60));
  
  console.log('\n🔍 Checking backend API routes...\n');
  
  const fs = require('fs');
  const path = require('path');
  
  try {
    const serverPath = path.join(__dirname, '..', 'server.js');
    const serverContent = fs.readFileSync(serverPath, 'utf8');
    
    // Extract API routes
    const routeMatches = serverContent.match(/app\.use\(['"`]\/api\/([^'"`]+)['"`]/g);
    
    if (routeMatches) {
      console.log('📋 Available API Endpoints:');
      routeMatches.forEach(route => {
        console.log(`   • ${route.replace(/app\.use\(['"`]/, '').replace(/['"`].*/, '')}`);
      });
    }
    
    console.log('\n🔍 Checking routes directory...\n');
    const routesPath = path.join(__dirname, '..', 'routes');
    if (fs.existsSync(routesPath)) {
      const routeFiles = fs.readdirSync(routesPath);
      console.log('📋 Route Files:');
      routeFiles.forEach(file => {
        console.log(`   • ${file}`);
      });
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║     COMPREHENSIVE DATABASE SCHEMA ANALYSIS REPORT         ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  
  const tables = [
    'subscription_plans',
    'subscriptions',
    'agencies',
    'territories',
    'leads',
    'users',
    'portals'
  ];
  
  // Analyze each table structure
  for (const table of tables) {
    await analyzeTable(table);
  }
  
  // Deep dive into business logic
  await analyzeSubscriptionPlans();
  await analyzeAgencyZipcodes();
  await analyzeSubscriptionToTerritory();
  await checkFlutterAPIs();
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ ANALYSIS COMPLETE');
  console.log('='.repeat(60));
  console.log('\n💡 KEY FINDINGS:');
  console.log('   1. Plans define max_units (how many zipcodes can be purchased)');
  console.log('   2. Each zipcode costs price_per_unit from the plan');
  console.log('   3. Agencies have territories stored in territories table');
  console.log('   4. Agencies.zipcodes and territories table should be synced');
  console.log('   5. Subscription.max_units should match purchased territory count\n');
}

main().catch(console.error);
