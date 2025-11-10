/**
 * Database Schema Verification Script
 * Checks all tables, columns, and API mappings
 */

const supabase = require('../config/supabaseClient');

async function verifyDatabaseSchema() {
  console.log('========================================');
  console.log('DATABASE SCHEMA VERIFICATION');
  console.log('========================================\n');

  const tables = [
    'agencies',
    'users',
    'subscription_plans',
    'subscriptions',
    'territories',
    'leads',
    'lead_assignments',
    'lead_purchases',
    'lead_notes',
    'lead_interactions',
    'lead_status_history',
    'lead_views',
    'portals',
    'billing_history',
    'transactions',
    'notifications',
    'notification_settings',
    'push_notifications',
    'agency_devices',
    'verification_documents',
    'audit_logs',
    'admin_activity_logs',
    'webhook_audit',
    'password_reset_tokens',
    'round_robin_state',
    'agency_subscriptions'
  ];

  const results = {
    existing: [],
    missing: [],
    errors: []
  };

  for (const table of tables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        if (error.code === '42P01' || error.message.includes('does not exist')) {
          results.missing.push(table);
          console.log(`❌ ${table} - NOT FOUND`);
        } else {
          results.errors.push({ table, error: error.message });
          console.log(`⚠️  ${table} - ERROR: ${error.message}`);
        }
      } else {
        results.existing.push(table);
        console.log(`✅ ${table} - EXISTS`);
      }
    } catch (err) {
      results.errors.push({ table, error: err.message });
      console.log(`⚠️  ${table} - ERROR: ${err.message}`);
    }
  }

  console.log('\n========================================');
  console.log('SUMMARY');
  console.log('========================================');
  console.log(`Total Tables Checked: ${tables.length}`);
  console.log(`✅ Existing: ${results.existing.length}`);
  console.log(`❌ Missing: ${results.missing.length}`);
  console.log(`⚠️  Errors: ${results.errors.length}`);

  if (results.missing.length > 0) {
    console.log('\n❌ MISSING TABLES:');
    results.missing.forEach(t => console.log(`   - ${t}`));
  }

  if (results.errors.length > 0) {
    console.log('\n⚠️  ERRORS:');
    results.errors.forEach(e => console.log(`   - ${e.table}: ${e.error}`));
  }

  return results;
}

async function verifyTableColumns() {
  console.log('\n========================================');
  console.log('VERIFYING CRITICAL TABLE COLUMNS');
  console.log('========================================\n');

  const criticalChecks = [
    {
      table: 'agencies',
      requiredColumns: ['id', 'business_name', 'email', 'password_hash', 'status', 'created_at'],
      optionalColumns: ['territories', 'territory_count', 'territory_limit', 'primary_zipcodes']
    },
    {
      table: 'leads',
      requiredColumns: ['id', 'lead_name', 'email', 'phone_number', 'city', 'state', 'zipcode'],
      optionalColumns: ['first_name', 'last_name', 'phone', 'address']
    },
    {
      table: 'subscriptions',
      requiredColumns: ['id', 'agency_id', 'plan_id', 'status', 'current_units'],
      optionalColumns: ['start_date', 'end_date', 'trial_end_date', 'next_billing_date']
    },
    {
      table: 'territories',
      requiredColumns: ['id', 'agency_id', 'subscription_id', 'type', 'value'],
      optionalColumns: ['zipcode', 'city', 'county', 'state', 'is_active']
    }
  ];

  for (const check of criticalChecks) {
    console.log(`\n📋 Table: ${check.table}`);
    
    try {
      // Fetch one row to check column structure
      const { data, error } = await supabase
        .from(check.table)
        .select('*')
        .limit(1);

      if (error) {
        console.log(`   ❌ Cannot access table: ${error.message}`);
        continue;
      }

      const sampleRow = data && data[0] ? data[0] : null;
      const availableColumns = sampleRow ? Object.keys(sampleRow) : [];

      console.log(`   Available columns: ${availableColumns.length}`);

      // Check required columns
      console.log('\n   Required Columns:');
      for (const col of check.requiredColumns) {
        if (availableColumns.includes(col)) {
          console.log(`   ✅ ${col}`);
        } else {
          console.log(`   ❌ ${col} - MISSING`);
        }
      }

      // Check optional columns
      if (check.optionalColumns && check.optionalColumns.length > 0) {
        console.log('\n   Optional Columns:');
        for (const col of check.optionalColumns) {
          if (availableColumns.includes(col)) {
            console.log(`   ✅ ${col}`);
          } else {
            console.log(`   ⚠️  ${col} - Not present`);
          }
        }
      }

    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`);
    }
  }
}

async function verifyAPItoDBMapping() {
  console.log('\n========================================');
  console.log('API TO DATABASE MAPPING VERIFICATION');
  console.log('========================================\n');

  // Test mobile territories API mapping
  console.log('📱 Mobile Territory API Mapping:');
  try {
    const { data: agencies, error } = await supabase
      .from('agencies')
      .select('id, business_name, territories, territory_count')
      .limit(1);

    if (error) {
      console.log(`   ❌ Cannot fetch agencies: ${error.message}`);
    } else if (agencies && agencies.length > 0) {
      const agency = agencies[0];
      console.log(`   ✅ Agency ID: ${agency.id}`);
      console.log(`   ✅ Business Name: ${agency.business_name}`);
      
      if (agency.territories !== undefined) {
        console.log(`   ✅ Territories field exists`);
        console.log(`   ✅ Territory count: ${agency.territory_count || 0}`);
        
        if (Array.isArray(agency.territories)) {
          console.log(`   ✅ Territories is array with ${agency.territories.length} items`);
        } else {
          console.log(`   ⚠️  Territories is not an array`);
        }
      } else {
        console.log(`   ⚠️  Territories field NOT found (migration not run)`);
      }
    } else {
      console.log(`   ⚠️  No agencies in database`);
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
  }

  // Test leads API mapping
  console.log('\n📋 Leads API Mapping:');
  try {
    const { data: leads, error } = await supabase
      .from('leads')
      .select('id, lead_name, email, phone_number, city, state, zipcode')
      .limit(1);

    if (error) {
      console.log(`   ❌ Cannot fetch leads: ${error.message}`);
    } else if (leads && leads.length > 0) {
      const lead = leads[0];
      console.log(`   ✅ Lead ID: ${lead.id}`);
      console.log(`   ✅ Lead Name: ${lead.lead_name || 'N/A'}`);
      console.log(`   ${lead.email ? '✅' : '⚠️ '} Email: ${lead.email || 'N/A'}`);
      console.log(`   ${lead.phone_number ? '✅' : '⚠️ '} Phone: ${lead.phone_number || 'N/A'}`);
      console.log(`   ✅ Location: ${lead.city}, ${lead.state} ${lead.zipcode}`);
    } else {
      console.log(`   ⚠️  No leads in database`);
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
  }

  // Test subscriptions API mapping
  console.log('\n💳 Subscriptions API Mapping:');
  try {
    const { data: subs, error } = await supabase
      .from('subscriptions')
      .select('id, agency_id, plan_id, status, current_units, start_date')
      .limit(1);

    if (error) {
      console.log(`   ❌ Cannot fetch subscriptions: ${error.message}`);
    } else if (subs && subs.length > 0) {
      const sub = subs[0];
      console.log(`   ✅ Subscription ID: ${sub.id}`);
      console.log(`   ✅ Agency ID: ${sub.agency_id}`);
      console.log(`   ✅ Plan ID: ${sub.plan_id}`);
      console.log(`   ✅ Status: ${sub.status}`);
      console.log(`   ✅ Current Units: ${sub.current_units}`);
      console.log(`   ${sub.start_date ? '✅' : '⚠️ '} Start Date: ${sub.start_date || 'N/A'}`);
    } else {
      console.log(`   ⚠️  No subscriptions in database`);
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
  }
}

async function checkFieldNaming() {
  console.log('\n========================================');
  console.log('FIELD NAMING CONVENTION CHECK');
  console.log('========================================\n');

  console.log('Checking for snake_case vs camelCase consistency...\n');

  const tables = ['agencies', 'leads', 'subscriptions'];
  
  for (const table of tables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);

      if (!error && data && data.length > 0) {
        const columns = Object.keys(data[0]);
        const snakeCase = columns.filter(c => c.includes('_'));
        const camelCase = columns.filter(c => /[a-z][A-Z]/.test(c));

        console.log(`📋 ${table}:`);
        console.log(`   Total columns: ${columns.length}`);
        console.log(`   snake_case: ${snakeCase.length}`);
        console.log(`   camelCase: ${camelCase.length}`);
        
        if (snakeCase.length > 0) {
          console.log(`   Snake case fields: ${snakeCase.slice(0, 5).join(', ')}${snakeCase.length > 5 ? '...' : ''}`);
        }
      }
    } catch (err) {
      console.log(`   ❌ Error checking ${table}: ${err.message}`);
    }
  }
}

async function main() {
  try {
    console.log('Starting database verification...\n');
    
    // Step 1: Verify all tables exist
    const tableResults = await verifyDatabaseSchema();
    
    // Step 2: Verify critical columns
    await verifyTableColumns();
    
    // Step 3: Verify API mappings
    await verifyAPItoDBMapping();
    
    // Step 4: Check field naming
    await checkFieldNaming();
    
    console.log('\n========================================');
    console.log('VERIFICATION COMPLETE');
    console.log('========================================\n');

    if (tableResults.missing.length > 0 || tableResults.errors.length > 0) {
      console.log('⚠️  Issues found. Review the output above.');
      process.exit(1);
    } else {
      console.log('✅ All checks passed!');
      process.exit(0);
    }

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
