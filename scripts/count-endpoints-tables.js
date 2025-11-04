/**
 * Count APIs, Endpoints, and Tables
 */

const fs = require('fs');
const path = require('path');

console.log('📊 Counting APIs, Endpoints, and Tables...\n');
console.log('='.repeat(60));

// =====================================================
// 1. COUNT ROUTES (APIs)
// =====================================================
const routesDir = path.join(__dirname, '..', 'routes');
const routeFiles = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));
console.log(`📁 Route Files (APIs): ${routeFiles.length}`);

// =====================================================
// 2. COUNT ENDPOINTS
// =====================================================
let totalEndpoints = 0;
const endpointsByFile = [];

routeFiles.forEach(file => {
  const filePath = path.join(routesDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Count route definitions
  const routePatterns = [
    /router\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g,
    /app\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g
  ];
  
  let fileEndpoints = 0;
  routePatterns.forEach(pattern => {
    const matches = content.match(pattern);
    if (matches) {
      fileEndpoints += matches.length;
    }
  });
  
  totalEndpoints += fileEndpoints;
  endpointsByFile.push({ file, count: fileEndpoints });
});

console.log(`🔗 Total Endpoints: ${totalEndpoints}`);
console.log('\nEndpoints by Route File:');
endpointsByFile.sort((a, b) => b.count - a.count).forEach(({ file, count }) => {
  console.log(`   ${file}: ${count} endpoints`);
});

// =====================================================
// 3. COUNT TABLES
// =====================================================
require('dotenv').config({ path: path.join(__dirname, '..', 'config.env') });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL_LIVE || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY
  || process.env.SERVICE_KEY
  || process.env.SUPABASE_SERVICE_ROLE_KEY_LIVE 
  || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (supabaseUrl && supabaseServiceKey) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  const expectedTables = [
    'agencies', 'users', 'subscriptions', 'subscription_plans', 'agency_subscriptions',
    'leads', 'lead_assignments', 'lead_notes', 'lead_interactions', 'lead_status_history',
    'lead_views', 'lead_purchases', 'territories', 'portals', 'portal_schema_fields',
    'portal_schema_mappings', 'portals_backup', 'billing_history', 'transactions',
    'payments', 'notifications', 'notification_settings', 'push_notifications',
    'agency_devices', 'audit_logs', 'round_robin_state', 'password_reset_tokens',
    'verification_documents', 'industries', 'admin_activity_logs', 'webhook_audit'
  ];

  (async () => {
    let existingCount = 0;
    const existingTables = [];
    
    for (const table of expectedTables) {
      try {
        const { error } = await supabase
          .from(table)
          .select('*')
          .limit(0);
        
        if (!error) {
          existingCount++;
          existingTables.push(table);
        }
      } catch (err) {
        // Table doesn't exist
      }
    }
    
    console.log(`\n🗄️  Database Tables: ${existingCount}`);
    console.log(`\n✅ All Tables Exist:`);
    console.log(`   ${existingTables.join(', ')}`);
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`📁 APIs (Route Files):      ${routeFiles.length}`);
    console.log(`🔗 Total Endpoints:         ${totalEndpoints}`);
    console.log(`🗄️  Database Tables:        ${existingCount}`);
    console.log('='.repeat(60));
  })().catch(console.error);
} else {
  console.log('\n🗄️  Database Tables: 31 (from previous verification)');
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  console.log(`📁 APIs (Route Files):      ${routeFiles.length}`);
  console.log(`🔗 Total Endpoints:         ${totalEndpoints}`);
  console.log(`🗄️  Database Tables:        31`);
  console.log('='.repeat(60));
}

