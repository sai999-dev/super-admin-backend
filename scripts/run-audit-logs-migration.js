/**
 * Script to run the audit_logs migration via Supabase client
 * Adds created_at and updated_at columns to audit_logs table
 */
const supabase = require('../config/supabaseClient');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', 'config.env') });

async function runMigration() {
  try {
    console.log('🔧 Running audit_logs migration...\n');

    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '..', 'migrations', '2025-11-17_add-created-at-to-audit-logs.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration SQL loaded from:', migrationPath);
    console.log('📊 Executing migration...\n');

    // Execute the SQL via Supabase RPC
    // Note: This uses the sql() method which executes raw SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      console.error('❌ Migration failed:', error);

      // Alternative: Try via REST API SQL endpoint
      console.log('\n🔄 Trying alternative method...');
      console.log('\n⚠️ Please run this migration manually via Supabase SQL Editor:');
      console.log('1. Go to your Supabase project dashboard');
      console.log('2. Navigate to SQL Editor');
      console.log('3. Copy and paste the contents of:');
      console.log(`   ${migrationPath}`);
      console.log('4. Click "Run" to execute the migration\n');
      process.exit(1);
    }

    console.log('✅ Migration completed successfully!');
    console.log(data);

    // Verify the columns were added
    console.log('\n🔍 Verifying new columns...');
    const { data: sampleData, error: verifyError } = await supabase
      .from('audit_logs')
      .select('id, created_at, updated_at, time_stamp')
      .limit(1);

    if (verifyError) {
      console.error('❌ Verification failed:', verifyError);
    } else if (sampleData && sampleData.length > 0) {
      console.log('✅ Columns verified! Sample record:');
      console.log(JSON.stringify(sampleData[0], null, 2));
    } else {
      console.log('✅ Migration applied (table is empty, no data to verify)');
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    console.log('\n⚠️ Please run this migration manually via Supabase SQL Editor:');
    console.log('1. Go to your Supabase project dashboard');
    console.log('2. Navigate to SQL Editor');
    console.log('3. Copy and paste the contents of:');
    console.log(`   migrations/2025-11-17_add-created-at-to-audit-logs.sql`);
    console.log('4. Click "Run" to execute the migration\n');
    process.exit(1);
  }
}

runMigration()
  .then(() => {
    console.log('\n🎉 Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
