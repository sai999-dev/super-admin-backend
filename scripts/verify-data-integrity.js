/**
 * Verify Data Integrity and Relationships
 * Tests all foreign key relationships work correctly
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ioqjonxjptvshdwhbuzv.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvcWpvbnhqcHR2c2hkd2hidXp2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTQ4MzQyNSwiZXhwIjoyMDc3MDU5NDI1fQ.ncz4UBVevblo9BGNhSezwYGpFopuyyhfYahtd__2eIs';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

console.log('🔍 Verifying Data Integrity and Relationships...\n');

async function verifyRelationships() {
  const results = {
    passed: [],
    failed: [],
    warnings: []
  };
  
  // Test 1: Agencies → Subscriptions
  console.log('1️⃣ Testing: agencies → subscriptions...');
  try {
    const { data: agencies, error } = await supabase
      .from('agencies')
      .select(`
        id,
        agency_name,
        subscriptions:subscriptions!agency_id(*)
      `)
      .limit(5);
    
    if (error) throw error;
    
    agencies.forEach(agency => {
      const subCount = agency.subscriptions?.length || 0;
      if (subCount > 0) {
        console.log(`   ✅ Agency "${agency.agency_name}" has ${subCount} subscription(s)`);
        results.passed.push(`agencies → subscriptions (${agency.agency_name})`);
      } else {
        console.log(`   ⚠️  Agency "${agency.agency_name}" has no subscriptions`);
        results.warnings.push(`agencies → subscriptions (${agency.agency_name} - no data)`);
      }
    });
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    results.failed.push(`agencies → subscriptions: ${error.message}`);
  }
  
  // Test 2: Subscriptions → Territories
  console.log('\n2️⃣ Testing: subscriptions → territories...');
  try {
    const { data: subscriptions, error } = await supabase
      .from('subscriptions')
      .select(`
        id,
        agency_id,
        territories:territories!subscription_id(*)
      `)
      .limit(5);
    
    if (error) throw error;
    
    subscriptions.forEach(sub => {
      const terrCount = sub.territories?.length || 0;
      if (terrCount > 0) {
        console.log(`   ✅ Subscription ${sub.id.substring(0, 8)}... has ${terrCount} territory(ies)`);
        results.passed.push(`subscriptions → territories (${sub.id.substring(0, 8)})`);
      } else {
        console.log(`   ⚠️  Subscription ${sub.id.substring(0, 8)}... has no territories`);
        results.warnings.push(`subscriptions → territories (${sub.id.substring(0, 8)} - no data)`);
      }
    });
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    results.failed.push(`subscriptions → territories: ${error.message}`);
  }
  
  // Test 3: Subscriptions → Subscription Plans
  console.log('\n3️⃣ Testing: subscriptions → subscription_plans...');
  try {
    const { data: subscriptions, error } = await supabase
      .from('subscriptions')
      .select(`
        id,
        plan_id,
        plans:subscription_plans!plan_id(plan_name, base_price)
      `)
      .limit(5);
    
    if (error) throw error;
    
    subscriptions.forEach(sub => {
      if (sub.plans) {
        console.log(`   ✅ Subscription ${sub.id.substring(0, 8)}... linked to plan "${sub.plans.plan_name}"`);
        results.passed.push(`subscriptions → subscription_plans (${sub.id.substring(0, 8)})`);
      } else {
        console.log(`   ⚠️  Subscription ${sub.id.substring(0, 8)}... has no linked plan`);
        results.warnings.push(`subscriptions → subscription_plans (${sub.id.substring(0, 8)})`);
      }
    });
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    results.failed.push(`subscriptions → subscription_plans: ${error.message}`);
  }
  
  // Test 4: Portals → Portal Schema Fields
  console.log('\n4️⃣ Testing: portals → portal_schema_fields...');
  try {
    const { data: portals, error } = await supabase
      .from('portals')
      .select(`
        id,
        portal_name,
        portal_schema_fields:portal_schema_fields!portal_id(*)
      `)
      .limit(5);
    
    if (error) throw error;
    
    portals.forEach(portal => {
      const fieldCount = portal.portal_schema_fields?.length || 0;
      if (fieldCount > 0) {
        console.log(`   ✅ Portal "${portal.portal_name}" has ${fieldCount} schema field(s)`);
        results.passed.push(`portals → portal_schema_fields (${portal.portal_name})`);
      } else {
        console.log(`   ⚠️  Portal "${portal.portal_name}" has no schema fields`);
        results.warnings.push(`portals → portal_schema_fields (${portal.portal_name} - no data)`);
      }
    });
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    results.failed.push(`portals → portal_schema_fields: ${error.message}`);
  }
  
  // Test 5: Leads → Lead Assignments (if exists)
  console.log('\n5️⃣ Testing: leads → lead_assignments...');
  try {
    const { data: leads, error } = await supabase
      .from('leads')
      .select(`
        id,
        lead_name,
        lead_assignments:lead_assignments!lead_id(*)
      `)
      .limit(5);
    
    if (error) throw error;
    
    if (leads && leads.length > 0) {
      leads.forEach(lead => {
        const assignCount = lead.lead_assignments?.length || 0;
        if (assignCount > 0) {
          console.log(`   ✅ Lead "${lead.lead_name}" has ${assignCount} assignment(s)`);
          results.passed.push(`leads → lead_assignments (${lead.lead_name})`);
        } else {
          console.log(`   ⚠️  Lead "${lead.lead_name}" has no assignments`);
          results.warnings.push(`leads → lead_assignments (${lead.lead_name} - not assigned)`);
        }
      });
    } else {
      console.log('   ⚠️  No leads found (empty table)');
      results.warnings.push('leads → lead_assignments (no data to test)');
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    results.failed.push(`leads → lead_assignments: ${error.message}`);
  }
  
  // Test 6: Verify foreign key constraints work
  console.log('\n6️⃣ Testing foreign key constraints...');
  try {
    // Try to insert invalid foreign key (should fail)
    const { error: fkError } = await supabase
      .from('subscriptions')
      .insert({
        agency_id: '00000000-0000-0000-0000-000000000000', // Invalid UUID
        plan_id: '00000000-0000-0000-0000-000000000000'
      })
      .select();
    
    if (fkError && fkError.code === '23503') {
      console.log('   ✅ Foreign key constraint working (rejected invalid FK)');
      results.passed.push('Foreign key constraints active');
    } else if (fkError) {
      console.log(`   ⚠️  Foreign key error: ${fkError.message}`);
      results.warnings.push(`FK constraint: ${fkError.message}`);
    } else {
      console.log('   ⚠️  Foreign key constraint may not be enforced');
      results.warnings.push('Foreign key constraints may need verification');
    }
  } catch (error) {
    console.log(`   ⚠️  Could not test FK constraint: ${error.message}`);
    results.warnings.push(`FK test: ${error.message}`);
  }
  
  // Summary
  console.log(`\n${'='.repeat(70)}`);
  console.log('📊 Integrity Check Summary:');
  console.log(`${'='.repeat(70)}`);
  console.log(`   ✅ Passed: ${results.passed.length}`);
  console.log(`   ⚠️  Warnings: ${results.warnings.length}`);
  console.log(`   ❌ Failed: ${results.failed.length}`);
  console.log(`${'='.repeat(70)}\n`);
  
  if (results.failed.length > 0) {
    console.log('❌ Failed Tests:');
    results.failed.forEach(f => console.log(`   - ${f}`));
    console.log('');
  }
  
  if (results.warnings.length > 0) {
    console.log('⚠️  Warnings:');
    results.warnings.forEach(w => console.log(`   - ${w}`));
    console.log('');
  }
  
  return results;
}

verifyRelationships().then(results => {
  const fs = require('fs');
  const path = require('path');
  
  fs.writeFileSync(
    path.join(__dirname, '..', 'DATA_INTEGRITY_REPORT.json'),
    JSON.stringify({
      timestamp: new Date().toISOString(),
      summary: {
        passed: results.passed.length,
        warnings: results.warnings.length,
        failed: results.failed.length
      },
      results: results
    }, null, 2)
  );
  
  console.log('💾 Saved to: DATA_INTEGRITY_REPORT.json');
  console.log('\n✅ Data integrity verification complete!\n');
}).catch(err => {
  console.error('Error:', err.message);
});

