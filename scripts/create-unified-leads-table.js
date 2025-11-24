/**
 * Script to create unified_leads table in Supabase
 * Run this script to set up the unified leads table
 */

const path = require('path');
const fs = require('fs');
const supabase = require('../config/supabaseClient');

async function createUnifiedLeadsTable() {
  try {
    console.log('🔍 Checking if unified_leads table exists...');

    // Check if table exists by trying to query it
    const { error: checkError } = await supabase
      .from('unified_leads')
      .select('id')
      .limit(1);

    if (!checkError) {
      console.log('✅ unified_leads table already exists!');
      return;
    }

    console.log('📝 Creating unified_leads table...');

    // Read migration SQL file
    const migrationPath = path.join(__dirname, '../migrations/create_unified_leads_table.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('📋 SQL to execute:');
    console.log(sql);

    // Note: Supabase client doesn't support raw SQL execution
    // You need to run this SQL in Supabase SQL Editor
    console.log('\n⚠️  IMPORTANT: Supabase client cannot execute raw SQL.');
    console.log('📝 Please run the following SQL in your Supabase SQL Editor:');
    console.log('\n' + '='.repeat(80));
    console.log(sql);
    console.log('='.repeat(80) + '\n');

    console.log('✅ Migration SQL prepared. Please execute it in Supabase SQL Editor.');

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

// Run the script
if (require.main === module) {
  createUnifiedLeadsTable()
    .then(() => {
      console.log('✅ Script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { createUnifiedLeadsTable };

