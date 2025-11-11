/**
 * Fix ALL Agencies Zipcode Sync
 */

require('dotenv').config({ path: 'config.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixAllAgencies() {
  console.log('\n🔧 FIXING ALL AGENCIES\n');
  
  // Get ALL agencies
  const { data: agencies, error } = await supabase
    .from('agencies')
    .select('id, agency_name, email, zipcodes, territories, territory_count, primary_zipcodes');
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log(`Found ${agencies.length} agencies\n`);
  
  for (const agency of agencies) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🏢 ${agency.agency_name || agency.email}`);
    console.log(`ID: ${agency.id}`);
    console.log(`Current zipcodes: ${JSON.stringify(agency.zipcodes)}`);
    console.log(`Current territories JSONB: ${JSON.stringify(agency.territories)}`);
    console.log(`Current territory_count: ${agency.territory_count}`);
    
    // Get actual territories from territories table
    const { data: actualTerritories } = await supabase
      .from('territories')
      .select('*')
      .eq('agency_id', agency.id)
      .eq('is_active', true);
    
    console.log(`\nActual territories in table: ${actualTerritories ? actualTerritories.length : 0}`);
    
    if (actualTerritories && actualTerritories.length > 0) {
      console.log('Territories found:');
      actualTerritories.forEach(t => {
        console.log(`  • ${t.zipcode || t.value} (${t.type})`);
      });
      
      // Extract unique zipcodes
      const zipcodes = [...new Set(actualTerritories.map(t => t.zipcode || t.value))].filter(Boolean);
      
      // Build territories JSONB array
      const territoriesArray = actualTerritories.map(t => ({
        id: t.id,
        type: t.type,
        value: t.value,
        state: t.state,
        zipcode: t.zipcode,
        city: t.city,
        county: t.county,
        priority: t.priority,
        is_active: t.is_active,
        subscription_id: t.subscription_id,
        added_at: t.created_at,
        metadata: t.metadata || {}
      }));
      
      console.log(`\n🔧 Updating agency with:`);
      console.log(`  zipcodes: ${JSON.stringify(zipcodes)}`);
      console.log(`  primary_zipcodes: ${JSON.stringify(zipcodes)}`);
      console.log(`  territory_count: ${actualTerritories.length}`);
      console.log(`  territories: ${territoriesArray.length} items`);
      
      const { error: updateError } = await supabase
        .from('agencies')
        .update({
          zipcodes: zipcodes,
          primary_zipcodes: zipcodes,
          territory_count: actualTerritories.length,
          territories: territoriesArray,
          territories_updated_at: new Date().toISOString()
        })
        .eq('id', agency.id);
      
      if (updateError) {
        console.log(`  ❌ Error: ${updateError.message}`);
      } else {
        console.log(`  ✅ SUCCESS - Agency updated`);
      }
    } else {
      console.log('  ⚠️  No territories found - agency has no zipcodes assigned');
      
      // Set empty arrays
      const { error: updateError } = await supabase
        .from('agencies')
        .update({
          zipcodes: [],
          primary_zipcodes: [],
          territory_count: 0,
          territories: []
        })
        .eq('id', agency.id);
      
      if (!updateError) {
        console.log(`  ✅ Set to empty arrays`);
      }
    }
  }
  
  console.log('\n\n' + '='.repeat(60));
  console.log('VERIFICATION - CHECKING ALL AGENCIES AGAIN');
  console.log('='.repeat(60) + '\n');
  
  const { data: verifyAgencies } = await supabase
    .from('agencies')
    .select('id, agency_name, email, zipcodes, territory_count, primary_zipcodes');
  
  verifyAgencies.forEach(agency => {
    const zipCount = Array.isArray(agency.zipcodes) ? agency.zipcodes.length : 0;
    const primaryCount = Array.isArray(agency.primary_zipcodes) ? agency.primary_zipcodes.length : 0;
    
    console.log(`${agency.agency_name || agency.email}:`);
    console.log(`  zipcodes: ${JSON.stringify(agency.zipcodes)} (${zipCount} items)`);
    console.log(`  primary_zipcodes: ${JSON.stringify(agency.primary_zipcodes)} (${primaryCount} items)`);
    console.log(`  territory_count: ${agency.territory_count}`);
    console.log(`  ${zipCount === agency.territory_count && primaryCount === agency.territory_count ? '✅' : '⚠️'} Synced\n`);
  });
  
  console.log('✅ DONE\n');
}

fixAllAgencies().catch(console.error);
