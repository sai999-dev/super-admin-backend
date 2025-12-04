/**
 * Check Current Plans Configuration
 */

require('dotenv').config({ path: 'config.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkPlans() {
  console.log('========================================');
  console.log('CURRENT SUBSCRIPTION PLANS IN DATABASE');
  console.log('========================================\n');
  
  const { data: plans, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .order('price_per_unit', { ascending: true });
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  plans.forEach(plan => {
    console.log(`📋 ${plan.name}`);
    console.log(`   💰 Price: $${plan.price_per_unit}`);
    console.log(`   📦 Unit Type: ${plan.unit_type}`);
    console.log(`   📍 Max Units: ${plan.max_units} zipcodes`);
    console.log(`   🔄 Billing: ${plan.billing_cycle}`);
    console.log(`   📝 Description: ${plan.description || 'Not set'}`);
    console.log(`   ✨ Features: ${JSON.stringify(plan.features)}`);
    console.log(`   📊 Metadata: ${JSON.stringify(plan.metadata)}`);
    console.log('');
  });
  
  console.log('========================================');
  console.log('EXPECTED CONFIGURATION:');
  console.log('========================================\n');
  console.log('✅ Basic Plan: $99 for 3 zipcodes');
  console.log('✅ Premium Plan: $199 for 7 zipcodes');
  console.log('✅ Business Plan: $299 for 10 zipcodes\n');
  
  console.log('ANALYSIS:');
  plans.forEach(plan => {
    const name = plan.name.toLowerCase();
    let expected = null;
    
    if (name.includes('basic')) {
      expected = { price: 99, zipcodes: 3 };
    } else if (name.includes('premium')) {
      expected = { price: 199, zipcodes: 7 };
    } else if (name.includes('business')) {
      expected = { price: 299, zipcodes: 10 };
    }
    
    if (expected) {
      const priceMatch = plan.price_per_unit === expected.price;
      const zipMatch = plan.max_units === expected.zipcodes;
      
      console.log(`\n${plan.name}:`);
      console.log(`  ${priceMatch ? '✅' : '❌'} Price: $${plan.price_per_unit} (expected $${expected.price})`);
      console.log(`  ${zipMatch ? '✅' : '❌'} Zipcodes: ${plan.max_units} (expected ${expected.zipcodes})`);
    }
  });
}

checkPlans();
