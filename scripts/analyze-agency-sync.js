/**
 * Complete Agency and Subscription Sync
 * Based on correct business logic:
 * - Basic: 3 zipcodes
 * - Premium: 7 zipcodes
 * - Business: 10 zipcodes
 */

require('dotenv').config({ path: 'config.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function analyzeAgencySubscriptions() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     AGENCY SUBSCRIPTION & ZIPCODE ANALYSIS                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  // Get all agencies
  const { data: agencies, error: agencyError } = await supabase
    .from('agencies')
    .select('*');
  
  if (agencyError) {
    console.error('Error:', agencyError);
    return;
  }
  
  console.log(`Found ${agencies.length} agency(ies)\n`);
  
  for (const agency of agencies) {
    console.log('═'.repeat(60));
    console.log(`🏢 AGENCY: ${agency.agency_name}`);
    console.log('═'.repeat(60));
    console.log(`ID: ${agency.id}`);
    console.log(`Email: ${agency.email}`);
    console.log(`Status: ${agency.status}`);
    console.log(`Industry: ${agency.industry}`);
    
    // Get agency's subscriptions
    const { data: subscriptions } = await supabase
      .from('subscriptions')
      .select('*, subscription_plans(*)')
      .eq('agency_id', agency.id);
    
    console.log(`\n📋 SUBSCRIPTIONS (${subscriptions ? subscriptions.length : 0}):`);
    
    if (subscriptions && subscriptions.length > 0) {
      for (const sub of subscriptions) {
        const plan = sub.subscription_plans;
        
        console.log(`\n  Subscription ID: ${sub.id.substring(0, 8)}...`);
        console.log(`  Plan: ${plan ? plan.name : 'Unknown'}`);
        console.log(`  Plan Price: $${plan ? plan.price_per_unit : 'N/A'}`);
        console.log(`  Plan Max Zipcodes: ${plan ? plan.max_units : 'N/A'}`);
        console.log(`  Status: ${sub.status}`);
        console.log(`  Units Purchased: ${sub.units_purchased || 'Not set'}`);
        console.log(`  Max Units: ${sub.max_units || 'Not set'}`);
        
        // Get territories for this subscription
        const { data: territories } = await supabase
          .from('territories')
          .select('*')
          .eq('subscription_id', sub.id)
          .eq('is_active', true);
        
        console.log(`  Actual Territories: ${territories ? territories.length : 0}`);
        
        if (territories && territories.length > 0) {
          console.log(`  Zipcodes:`);
          territories.forEach(t => {
            console.log(`    • ${t.zipcode || t.value} (${t.type})`);
          });
        }
        
        // Check if subscription matches plan
        const expectedZipcodes = plan ? plan.max_units : 0;
        const actualZipcodes = territories ? territories.length : 0;
        const purchasedMatch = sub.units_purchased === actualZipcodes;
        const withinLimit = actualZipcodes <= expectedZipcodes;
        
        console.log(`\n  VALIDATION:`);
        console.log(`    ${purchasedMatch ? '✅' : '⚠️ '} units_purchased (${sub.units_purchased}) ${purchasedMatch ? '=' : '!='} actual (${actualZipcodes})`);
        console.log(`    ${withinLimit ? '✅' : '❌'} actual (${actualZipcodes}) ${withinLimit ? '<=' : '>'} plan limit (${expectedZipcodes})`);
        
        // Fix if needed
        if (!purchasedMatch || sub.max_units !== expectedZipcodes) {
          console.log(`\n  🔧 FIXING SUBSCRIPTION...`);
          const { error: fixError } = await supabase
            .from('subscriptions')
            .update({
              units_purchased: actualZipcodes,
              max_units: expectedZipcodes,
              current_units: actualZipcodes
            })
            .eq('id', sub.id);
          
          if (fixError) {
            console.log(`    ❌ Error: ${fixError.message}`);
          } else {
            console.log(`    ✅ Fixed: units_purchased=${actualZipcodes}, max_units=${expectedZipcodes}`);
          }
        }
      }
    }
    
    // Get all territories for this agency (regardless of subscription)
    const { data: allTerritories } = await supabase
      .from('territories')
      .select('*')
      .eq('agency_id', agency.id)
      .eq('is_active', true);
    
    console.log(`\n📍 AGENCY TERRITORIES (${allTerritories ? allTerritories.length : 0}):`);
    
    if (allTerritories && allTerritories.length > 0) {
      const zipcodes = [...new Set(allTerritories.map(t => t.zipcode || t.value))].filter(Boolean);
      console.log(`  Unique Zipcodes: ${zipcodes.join(', ')}`);
      
      // Update agency zipcodes
      const { error: updateError } = await supabase
        .from('agencies')
        .update({
          zipcodes: zipcodes,
          primary_zipcodes: zipcodes,
          territory_count: allTerritories.length
        })
        .eq('id', agency.id);
      
      if (updateError) {
        console.log(`  ❌ Error updating agency: ${updateError.message}`);
      } else {
        console.log(`  ✅ Agency updated with ${zipcodes.length} zipcodes`);
      }
    } else {
      console.log('  No active territories found');
    }
    
    console.log('');
  }
  
  // Summary
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     BUSINESS LOGIC SUMMARY                                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  const { data: plans } = await supabase
    .from('subscription_plans')
    .select('name, price_per_unit, max_units')
    .order('price_per_unit', { ascending: true });
  
  console.log('📦 SUBSCRIPTION PLANS:\n');
  plans.forEach(plan => {
    console.log(`  ${plan.name}:`);
    console.log(`    💰 Price: $${plan.price_per_unit}/month`);
    console.log(`    📍 Includes: ${plan.max_units} zipcodes`);
    console.log('');
  });
  
  console.log('💡 BUSINESS MODEL:');
  console.log('  • Each plan includes a FIXED number of zipcodes');
  console.log('  • Basic: $99 = 3 zipcodes');
  console.log('  • Premium: $199 = 7 zipcodes');
  console.log('  • Business: $299 = 10 zipcodes');
  console.log('  • Agency pays one flat fee per plan');
  console.log('  • No per-zipcode pricing\n');
}

analyzeAgencySubscriptions().catch(console.error);
