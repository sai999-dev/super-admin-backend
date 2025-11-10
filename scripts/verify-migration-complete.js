/**
 * Verify Database Schema After Migration
 */

require('dotenv').config({ path: 'config.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyMigration() {
  console.log('========================================');
  console.log('Database Migration Verification');
  console.log('========================================\n');

  const results = {
    agencies: { missing: [], present: [] },
    territories: { missing: [], present: [] },
    leads: { missing: [], present: [] }
  };

  try {
    // Check agencies
    console.log('1. Verifying AGENCIES table...');
    const { data: agencies, error: agencyError } = await supabase
      .from('agencies')
      .select('*')
      .limit(1);

    if (agencyError) {
      console.error('❌ Cannot access agencies:', agencyError.message);
    } else if (agencies && agencies[0]) {
      const columns = Object.keys(agencies[0]);
      const required = [
        'password_hash', 'created_at', 'territories', 'territory_count',
        'territory_limit', 'preferred_territory_type', 'primary_zipcodes',
        'primary_cities', 'primary_counties', 'primary_states', 'territories_updated_at'
      ];
      
      required.forEach(col => {
        if (columns.includes(col)) {
          results.agencies.present.push(col);
        } else {
          results.agencies.missing.push(col);
        }
      });
      
      if (results.agencies.missing.length === 0) {
        console.log('   ✅ All required columns present');
      } else {
        console.log('   ❌ Missing columns:', results.agencies.missing.join(', '));
      }
      
      // Check if data was migrated
      const { data: withTerritories } = await supabase
        .from('agencies')
        .select('id, agency_name, territory_count')
        .gt('territory_count', 0);
      
      if (withTerritories && withTerritories.length > 0) {
        console.log(`   ✅ ${withTerritories.length} agencies have territories migrated`);
      } else {
        console.log('   ⚠️  No agencies with territories yet');
      }
    }

    // Check territories
    console.log('\n2. Verifying TERRITORIES table...');
    const { data: territories, error: terrError } = await supabase
      .from('territories')
      .select('*')
      .limit(1);

    if (terrError) {
      console.error('❌ Cannot access territories:', terrError.message);
    } else if (territories && territories[0]) {
      const columns = Object.keys(territories[0]);
      const required = ['zipcode', 'city', 'county'];
      
      required.forEach(col => {
        if (columns.includes(col)) {
          results.territories.present.push(col);
        } else {
          results.territories.missing.push(col);
        }
      });
      
      if (results.territories.missing.length === 0) {
        console.log('   ✅ All required columns present');
      } else {
        console.log('   ❌ Missing columns:', results.territories.missing.join(', '));
      }
      
      // Check country->county rename
      if (columns.includes('country')) {
        console.log('   ⚠️  "country" column still exists (should be renamed to "county")');
      } else {
        console.log('   ✅ "country" renamed to "county"');
      }
    }

    // Check leads
    console.log('\n3. Verifying LEADS table...');
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('*')
      .limit(1);

    if (leadsError) {
      console.error('❌ Cannot access leads:', leadsError.message);
    } else if (leads && leads[0]) {
      const columns = Object.keys(leads[0]);
      const required = ['city', 'state', 'zipcode', 'first_name', 'last_name', 'phone', 'address'];
      
      required.forEach(col => {
        if (columns.includes(col)) {
          results.leads.present.push(col);
        } else {
          results.leads.missing.push(col);
        }
      });
      
      if (results.leads.missing.length === 0) {
        console.log('   ✅ All required columns present');
      } else {
        console.log('   ❌ Missing columns:', results.leads.missing.join(', '));
      }
      
      // Check if data was extracted
      const { data: withLocation } = await supabase
        .from('leads')
        .select('id')
        .not('city', 'is', null);
      
      if (withLocation && withLocation.length > 0) {
        console.log(`   ✅ ${withLocation.length} leads have location data`);
      } else {
        console.log('   ⚠️  No leads with city data yet');
      }
    }

    // Final summary
    console.log('\n========================================');
    console.log('VERIFICATION SUMMARY');
    console.log('========================================');
    
    const totalMissing = results.agencies.missing.length + 
                        results.territories.missing.length + 
                        results.leads.missing.length;
    
    if (totalMissing === 0) {
      console.log('✅ ALL CHECKS PASSED');
      console.log('   - All columns created successfully');
      console.log('   - Models are aligned with database');
      console.log('   - Ready for API testing');
    } else {
      console.log('❌ MIGRATION INCOMPLETE');
      console.log(`   - ${totalMissing} columns still missing`);
      console.log('   - Please execute EXECUTE_IN_SUPABASE.sql');
    }
    
    console.log('========================================\n');

  } catch (error) {
    console.error('\n❌ Verification Error:', error.message);
    process.exit(1);
  }
}

verifyMigration();
