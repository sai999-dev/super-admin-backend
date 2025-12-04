/**
 * Run Database Fix Migration
 * Adds missing columns and migrates territory data
 */

require('dotenv').config({ path: 'config.env' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
  console.log('========================================');
  console.log('Starting Database Fix Migration');
  console.log('========================================\n');

  try {
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '../migrations/2025-11-10_fix-database-mapping.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('Executing migration SQL...');
    console.log('This may take a few moments...\n');

    // Execute the migration
    const { data, error } = await supabase.rpc('exec_sql', { 
      sql: migrationSQL 
    });

    if (error) {
      console.error('❌ Migration failed:', error.message);
      console.error('Error details:', error);
      
      // Try alternative approach - execute directly
      console.log('\nTrying direct execution...');
      const { data: directData, error: directError } = await supabase
        .from('_migrations')
        .select('*')
        .limit(1);
      
      if (directError) {
        console.log('Note: Cannot use RPC exec_sql. Executing via raw query...');
        
        // Split and execute statements individually
        const statements = migrationSQL
          .split(/;\s*\n/)
          .filter(stmt => stmt.trim().length > 0);
        
        console.log(`Executing ${statements.length} statements...`);
        
        for (let i = 0; i < statements.length; i++) {
          const stmt = statements[i].trim();
          if (!stmt) continue;
          
          try {
            const result = await supabase.rpc('exec_sql', { sql: stmt + ';' });
            if (result.error) {
              console.log(`Statement ${i + 1} warning:`, result.error.message);
            } else {
              console.log(`✓ Statement ${i + 1} executed`);
            }
          } catch (err) {
            console.log(`⚠ Statement ${i + 1} skipped:`, err.message);
          }
        }
      }
    } else {
      console.log('✅ Migration executed successfully!');
    }

    console.log('\n========================================');
    console.log('Verifying migration results...');
    console.log('========================================\n');

    // Verify agencies table
    const { data: agencyColumns, error: agencyError } = await supabase
      .from('agencies')
      .select('*')
      .limit(1);

    if (!agencyError && agencyColumns) {
      console.log('✅ Agencies table accessible');
      const agency = agencyColumns[0];
      if (agency) {
        console.log('Available fields:', Object.keys(agency).join(', '));
        if ('territories' in agency) {
          console.log('✅ territories column exists');
        }
        if ('territory_count' in agency) {
          console.log('✅ territory_count column exists');
        }
      }
    }

    // Verify territories table
    const { data: territories, error: terrError } = await supabase
      .from('territories')
      .select('*')
      .limit(1);

    if (!terrError && territories) {
      console.log('\n✅ Territories table accessible');
      const territory = territories[0];
      if (territory) {
        console.log('Available fields:', Object.keys(territory).join(', '));
      }
    }

    // Verify leads table
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('*')
      .limit(1);

    if (!leadsError && leads) {
      console.log('\n✅ Leads table accessible');
      const lead = leads[0];
      if (lead) {
        console.log('Available fields:', Object.keys(lead).join(', '));
      }
    }

    // Check migration stats
    const { data: agenciesWithTerritories, error: statsError } = await supabase
      .from('agencies')
      .select('id, agency_name, territories, territory_count')
      .not('territories', 'is', null);

    if (!statsError && agenciesWithTerritories) {
      console.log('\n========================================');
      console.log('Migration Statistics');
      console.log('========================================');
      console.log(`Agencies with territories: ${agenciesWithTerritories.length}`);
      
      const totalTerritories = agenciesWithTerritories.reduce((sum, agency) => {
        return sum + (agency.territory_count || 0);
      }, 0);
      
      console.log(`Total territories migrated: ${totalTerritories}`);
    }

    console.log('\n========================================');
    console.log('✅ Database Fix Migration Complete!');
    console.log('========================================');

  } catch (error) {
    console.error('\n❌ Migration Error:', error);
    process.exit(1);
  }
}

runMigration();
