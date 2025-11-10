/**
 * Run Territory Consolidation Migration
 * Executes the SQL migration to add territory fields to agencies table
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'config.env') });

async function runMigration() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🔄 Connecting to database...');
    await client.connect();
    console.log('✅ Connected to database\n');

    // Read migration file
    const migrationPath = path.join(__dirname, '..', 'migrations', '2025-11-10_add-territories-to-agencies.sql');
    console.log(`📄 Reading migration: ${migrationPath}`);
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('🚀 Executing migration...\n');
    console.log('=' .repeat(60));
    
    // Execute migration
    const result = await client.query(migrationSQL);
    
    console.log('=' .repeat(60));
    console.log('\n✅ Migration completed successfully!\n');

    // Verify migration
    console.log('🔍 Verifying migration...');
    
    const verifyQuery = `
      SELECT 
        COUNT(*) as agency_count,
        SUM(CASE WHEN jsonb_array_length(territories) > 0 THEN 1 ELSE 0 END) as agencies_with_territories,
        SUM(territory_count) as total_territories
      FROM agencies;
    `;
    
    const verification = await client.query(verifyQuery);
    const stats = verification.rows[0];
    
    console.log('\n📊 Migration Statistics:');
    console.log(`   Total Agencies: ${stats.agency_count}`);
    console.log(`   Agencies with Territories: ${stats.agencies_with_territories}`);
    console.log(`   Total Territories Migrated: ${stats.total_territories}`);
    
    // Check if triggers were created
    const triggerQuery = `
      SELECT trigger_name 
      FROM information_schema.triggers 
      WHERE event_object_table = 'agencies' 
      AND trigger_name IN ('trigger_update_territory_count', 'trigger_extract_primary_territories');
    `;
    
    const triggers = await client.query(triggerQuery);
    console.log(`\n🔧 Triggers Created: ${triggers.rows.length}/2`);
    triggers.rows.forEach(t => console.log(`   ✅ ${t.trigger_name}`));
    
    // Check if view was created
    const viewQuery = `
      SELECT table_name 
      FROM information_schema.views 
      WHERE table_name = 'territories_view';
    `;
    
    const views = await client.query(viewQuery);
    if (views.rows.length > 0) {
      console.log('\n👁️  Backward Compatibility View: ✅ territories_view created');
    }

    console.log('\n' + '=' .repeat(60));
    console.log('🎉 Territory consolidation migration complete!');
    console.log('=' .repeat(60));
    console.log('\nNext steps:');
    console.log('1. Test the mobile API endpoints');
    console.log('2. Test the admin territory management');
    console.log('3. Verify Flutter app still works correctly');
    console.log('4. Consider backing up the old territories table');
    console.log('5. Update any custom queries that use the territories table');
    
  } catch (error) {
    console.error('\n❌ Migration failed:');
    console.error(error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

// Run migration
runMigration().catch(console.error);
