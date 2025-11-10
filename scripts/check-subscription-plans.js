/**
 * Check Subscription Plans Table Specifically
 */

require('dotenv').config({ path: 'config.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSubscriptionPlans() {
  console.log('========================================');
  console.log('SUBSCRIPTION PLANS TABLE VERIFICATION');
  console.log('========================================\n');

  try {
    // Get actual database columns
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .limit(1);

    if (error) {
      console.error('❌ Error accessing table:', error.message);
      return;
    }

    if (data && data[0]) {
      const actualColumns = Object.keys(data[0]);
      console.log('📊 ACTUAL DATABASE COLUMNS:');
      console.log('   Total columns:', actualColumns.length);
      actualColumns.forEach(col => console.log(`   - ${col}`));
    }

    // Check model file
    const fs = require('fs');
    const path = require('path');
    const modelPath = path.join(__dirname, '..', 'models/SubscriptionPlan.js');
    
    if (fs.existsSync(modelPath)) {
      const modelContent = fs.readFileSync(modelPath, 'utf8');
      
      console.log('\n📝 MODEL FIELD MAPPINGS:');
      
      // Extract field definitions
      const fieldMatches = modelContent.matchAll(/(\w+):\s*{[^}]*field:\s*['"](\w+)['"]/g);
      const mappings = {};
      
      for (const match of fieldMatches) {
        const jsField = match[1];
        const dbField = match[2];
        mappings[jsField] = dbField;
        console.log(`   ${jsField} → ${dbField}`);
      }
      
      // Also check for fields without explicit mapping
      const fieldDefinitions = modelContent.matchAll(/(\w+):\s*{[\s\S]*?type:\s*DataTypes\./g);
      const allFields = [];
      for (const match of fieldDefinitions) {
        allFields.push(match[1]);
      }
      
      console.log('\n📋 ALL MODEL FIELDS:', allFields.join(', '));
    }

    // Get sample data
    const { data: samples } = await supabase
      .from('subscription_plans')
      .select('*')
      .limit(3);
    
    if (samples && samples.length > 0) {
      console.log('\n💾 SAMPLE DATA:');
      samples.forEach((plan, idx) => {
        console.log(`\n   Plan ${idx + 1}:`);
        Object.entries(plan).forEach(([key, value]) => {
          console.log(`      ${key}: ${value}`);
        });
      });
    }

    // List what should be in the table
    console.log('\n\n🎯 EXPECTED COLUMNS FOR SUBSCRIPTION PLANS:');
    const expectedColumns = [
      'id',
      'plan_name',
      'plan_type',
      'base_price',
      'billing_cycle',
      'features',
      'territory_limits',
      'lead_limits',
      'is_active',
      'created_at',
      'updated_at'
    ];
    
    expectedColumns.forEach(col => {
      const exists = actualColumns.includes(col);
      console.log(`   ${exists ? '✅' : '❌'} ${col}`);
    });
    
    // Check for extra/unwanted columns
    console.log('\n\n⚠️  CHECKING FOR UNWANTED COLUMNS:');
    actualColumns.forEach(col => {
      if (!expectedColumns.includes(col)) {
        console.log(`   ⚠️  ${col} - Not in expected list`);
      }
    });

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

checkSubscriptionPlans();
