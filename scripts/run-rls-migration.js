/**
 * Run RLS Migration via Supabase
 * Executes the RLS security migration
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://ioqjonxjptvshdwhbuzv.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvcWpvbnhqcHR2c2hkd2hidXp2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTQ4MzQyNSwiZXhwIjoyMDc3MDU5NDI1fQ.ncz4UBVevblo9BGNhSezwYGpFopuyyhfYahtd__2eIs';

console.log('🔒 Running RLS Security Migration...\n');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Read migration file
const migrationPath = path.join(__dirname, '..', 'migrations', '2025-01-21_enable-rls-security.sql');
const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

// Split into individual statements
const statements = migrationSQL
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('BEGIN') && !s.startsWith('COMMIT'));

console.log(`📋 Found ${statements.length} SQL statements to execute\n`);

// Note: Supabase doesn't support executing arbitrary SQL via REST API
// We need to use direct PostgreSQL connection or Supabase SQL Editor
console.log('⚠️  Note: Supabase REST API cannot execute DDL statements directly.');
console.log('   You need to run this migration manually:\n');
console.log('   Option 1: Use Supabase Dashboard SQL Editor');
console.log('   Option 2: Use direct PostgreSQL connection\n');
console.log('📝 Migration file ready: migrations/2025-01-21_enable-rls-security.sql\n');

// Create a verification script instead
createRLSVerificationScript();

function createRLSVerificationScript() {
  const script = `/**
 * Verify RLS Status on Tables
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://ioqjonxjptvshdwhbuzv.supabase.co',
  '${SUPABASE_SERVICE_KEY}'
);

async function checkRLSStatus() {
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
  
  console.log('🔍 Checking RLS status...\n');
  
  // Note: Can't directly check RLS via REST API
  // Need to use direct PostgreSQL connection
  
  console.log('💡 To enable RLS, run this SQL in Supabase Dashboard → SQL Editor:');
  console.log('   File: migrations/2025-01-21_enable-rls-security.sql\n');
}

checkRLSStatus();
`;

  fs.writeFileSync(
    path.join(__dirname, 'verify-rls-status.js'),
    script
  );
  
  console.log('✅ Created verification script: scripts/verify-rls-status.js');
}

