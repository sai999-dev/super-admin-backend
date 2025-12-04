/**
 * Script to create temp_leads table in Supabase
 * This will create the table if it doesn't exist
 */

require('dotenv').config({ path: require('path').join(__dirname, '../config.env') });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase credentials in config.env');
  console.error('   Required: SUPABASE_URL, SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function createTempLeadsTable() {
  try {
    console.log('🔍 Checking if temp_leads table exists...');
    
    // Try to query the table
    const { data, error } = await supabase
      .from('temp_leads')
      .select('*')
      .limit(1);
    
    if (!error) {
      console.log('✅ temp_leads table already exists!');
      return;
    }
    
    if (error && error.code === '42P01') {
      // Table doesn't exist (PostgreSQL error code for "relation does not exist")
      console.log('📋 Table does not exist. Creating it...');
      console.log('\n⚠️  Supabase JS client cannot execute DDL (CREATE TABLE) statements.');
      console.log('📝 Please run this SQL in your Supabase SQL Editor:\n');
      console.log('='.repeat(70));
      
      const migrationPath = path.join(__dirname, '../migrations/create_temp_leads_table.sql');
      const sql = fs.readFileSync(migrationPath, 'utf8');
      console.log(sql);
      
      console.log('='.repeat(70));
      console.log('\n📌 Steps to create the table:');
      console.log('   1. Go to your Supabase Dashboard');
      console.log('   2. Click on "SQL Editor" in the left sidebar');
      console.log('   3. Click "New Query"');
      console.log('   4. Copy and paste the SQL above');
      console.log('   5. Click "Run" (or press Cmd/Ctrl + Enter)');
      console.log('   6. You should see "Success. No rows returned"');
      console.log('\n✅ After creating the table, the webhook will work!');
    } else {
      console.error('❌ Error checking table:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n📝 Please run this SQL manually in Supabase SQL Editor:');
    const migrationPath = path.join(__dirname, '../migrations/create_temp_leads_table.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log('\n' + '='.repeat(70));
    console.log(sql);
    console.log('='.repeat(70) + '\n');
  }
}

createTempLeadsTable();
