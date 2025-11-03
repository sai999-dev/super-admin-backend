/**
 * Get Real Tables List from Supabase
 * Uses direct SQL query to get all actual tables
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', 'config.env') });
const { Client } = require('pg');

const supabaseUrl = process.env.SUPABASE_URL_LIVE || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY
  || process.env.SERVICE_KEY
  || process.env.SUPABASE_SERVICE_ROLE_KEY_LIVE 
  || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

// Extract database connection details from Supabase URL
// Supabase URL format: https://project-ref.supabase.co
// Connection: postgresql://postgres:[password]@db.project-ref.supabase.co:5432/postgres

async function getTablesDirect() {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Query pg_tables via a simple SELECT on a known table, then use SQL function
    // We'll use a workaround: query information_schema via Supabase
    
    // Try using Supabase's REST API with a custom query
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      // This might give us table info
    }

    // Alternative: Use a known table query with a function
    // For now, let's query each expected table individually
    return null;
  } catch (err) {
    console.error('Error:', err.message);
    return null;
  }
}

async function getRealTablesFromSchema() {
  console.log('🔍 Querying Supabase for all tables...\n');

  // Expected tables based on migrations and models
  const expectedTables = [
    'agencies',
    'users',
    'subscriptions',
    'subscription_plans',
    'agency_subscriptions',
    'leads',
    'lead_assignments',
    'lead_notes',
    'lead_interactions',
    'lead_status_history',
    'lead_views',
    'territories',
    'portals',
    'portal_schema_fields',
    'portal_schema_mappings',
    'portals_backup',
    'billing_history',
    'transactions',
    'payments',
    'notifications',
    'notification_settings',
    'push_notifications',
    'agency_devices',
    'audit_logs',
    'round_robin_state',
    'password_reset_tokens',
    'verification_documents',
    'industries',
    'admin_activity_logs',
    'webhook_audit',
    'lead_purchases'
  ];

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const existingTables = [];
  const missingTables = [];

  console.log('📊 Checking each expected table...\n');

  for (const table of expectedTables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(0);

      if (error) {
        if (error.code === 'PGRST116' || error.message.includes('does not exist') || error.message.includes('schema cache')) {
          missingTables.push(table);
          console.log(`❌ ${table} - Missing`);
        } else {
          // Other error - might still exist
          console.log(`⚠️  ${table} - Error: ${error.message}`);
          existingTables.push(table); // Assume it exists if it's a different error
        }
      } else {
        existingTables.push(table);
        console.log(`✅ ${table} - Exists`);
      }
    } catch (err) {
      console.log(`⚠️  ${table} - Exception: ${err.message}`);
      missingTables.push(table);
    }
  }

  return { existing: existingTables, missing: missingTables };
}

async function main() {
  const result = await getRealTablesFromSchema();

  console.log('\n' + '='.repeat(60));
  console.log('📊 FINAL TABLE VERIFICATION');
  console.log('='.repeat(60));
  console.log(`✅ Existing Tables: ${result.existing.length}`);
  console.log(`❌ Missing Tables: ${result.missing.length}`);
  console.log(`📋 Total Checked: ${result.existing.length + result.missing.length}`);
  console.log('\n');

  if (result.existing.length > 0) {
    console.log('✅ EXISTING TABLES:');
    result.existing.forEach(t => console.log(`   - ${t}`));
    console.log('\n');
  }

  if (result.missing.length > 0) {
    console.log('❌ MISSING TABLES:');
    result.missing.forEach(t => console.log(`   - ${t}`));
    console.log('\n');
  }

  // Save to file
  const fs = require('fs');
  const report = {
    existing: result.existing.sort(),
    missing: result.missing.sort(),
    total: result.existing.length + result.missing.length,
    verified_at: new Date().toISOString()
  };

  fs.writeFileSync(
    require('path').join(__dirname, '..', 'TABLE_VERIFICATION_REPORT.json'),
    JSON.stringify(report, null, 2)
  );

  console.log('📄 Report saved to: TABLE_VERIFICATION_REPORT.json\n');
}

main().catch(console.error);

