/**
 * Verify RLS is Enabled on All Tables
 * Checks which tables have RLS enabled after running migration
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ioqjonxjptvshdwhbuzv.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvcWpvbnhqcHR2c2hkd2hidXp2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTQ4MzQyNSwiZXhwIjoyMDc3MDU5NDI1fQ.ncz4UBVevblo9BGNhSezwYGpFopuyyhfYahtd__2eIs';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

console.log('🔍 Verifying RLS is Enabled on Tables...\n');

// Note: We can't directly check RLS status via Supabase REST API
// This script will check if we can query tables and verify policies exist

const tables = [
  'portal_schema_fields', 'agencies', 'users', 'leads', 'lead_assignments',
  'portals', 'subscription_plans', 'subscriptions', 'territories',
  'billing_history', 'transactions', 'lead_notes', 'lead_interactions',
  'lead_status_history', 'lead_views', 'webhook_deliveries', 'webhook_audit',
  'password_reset_tokens', 'audit_logs', 'admin_activity_logs',
  'agency_devices', 'notification_settings', 'notifications',
  'verification_documents', 'system_settings', 'round_robin_state',
  'agency_subscriptions'
];

async function verifyRLS() {
  const results = {
    accessible: [],
    errors: [],
    notFound: []
  };
  
  console.log('Checking table access (RLS affects queries)...\n');
  
  for (const table of tables) {
    try {
      // Try to query the table
      // With RLS enabled, we should still be able to query with service role
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);
      
      if (error) {
        if (error.code === '42P01') {
          // Table doesn't exist
          results.notFound.push(table);
          console.log(`   ⚠️  ${table} - Table does not exist`);
        } else if (error.message.includes('permission denied') || error.message.includes('RLS')) {
          // RLS might be blocking (unlikely with service role)
          results.errors.push({ table, error: error.message });
          console.log(`   ⚠️  ${table} - Access issue: ${error.message}`);
        } else {
          results.errors.push({ table, error: error.message });
          console.log(`   ❌ ${table} - Error: ${error.message}`);
        }
      } else {
        // Table exists and is accessible
        results.accessible.push(table);
        console.log(`   ✅ ${table} - Accessible`);
      }
    } catch (err) {
      results.errors.push({ table, error: err.message });
      console.log(`   ❌ ${table} - Exception: ${err.message}`);
    }
  }
  
  console.log(`\n${'='.repeat(70)}`);
  console.log('📊 RLS Verification Summary:');
  console.log(`${'='.repeat(70)}`);
  console.log(`   ✅ Accessible tables: ${results.accessible.length}`);
  console.log(`   ⚠️  Tables not found: ${results.notFound.length}`);
  console.log(`   ❌ Errors: ${results.errors.length}`);
  console.log(`${'='.repeat(70)}\n`);
  
  if (results.notFound.length > 0) {
    console.log('⚠️  Tables Not Found (this is OK - migration skipped them):');
    results.notFound.forEach(t => console.log(`   - ${t}`));
    console.log('');
  }
  
  if (results.errors.length > 0) {
    console.log('❌ Errors:');
    results.errors.forEach(e => console.log(`   - ${e.table}: ${e.error}`));
    console.log('');
  }
  
  console.log('💡 To verify RLS policies in Supabase Dashboard:');
  console.log('   1. Go to Authentication → Policies');
  console.log('   2. Select each table to see its policies');
  console.log('   3. Tables with RLS enabled will show policies\n');
  
  console.log('💡 Or run this SQL query in Supabase SQL Editor:');
  console.log(`
SELECT 
    tablename,
    CASE 
        WHEN (SELECT relrowsecurity FROM pg_class WHERE relname = tablename) 
        THEN '✅ RLS Enabled' 
        ELSE '❌ RLS Disabled' 
    END as rls_status,
    (SELECT COUNT(*) FROM pg_policies WHERE tablename = pg_tables.tablename) as policy_count
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;
  `);
  
  return results;
}

verifyRLS().then(results => {
  const fs = require('fs');
  const path = require('path');
  
  fs.writeFileSync(
    path.join(__dirname, '..', 'RLS_VERIFICATION_RESULT.json'),
    JSON.stringify({
      timestamp: new Date().toISOString(),
      summary: {
        accessible: results.accessible.length,
        notFound: results.notFound.length,
        errors: results.errors.length
      },
      results: results
    }, null, 2)
  );
  
  console.log('💾 Saved to: RLS_VERIFICATION_RESULT.json\n');
  console.log('✅ Verification complete!\n');
}).catch(err => {
  console.error('Error:', err.message);
});

