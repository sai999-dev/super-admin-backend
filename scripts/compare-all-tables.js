/**
 * Compare ALL Database Columns vs Model Expectations
 */

require('dotenv').config({ path: 'config.env' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function compareAllTables() {
  console.log('========================================');
  console.log('COMPLETE DATABASE vs MODEL COMPARISON');
  console.log('========================================\n');

  const tablesToCheck = [
    { table: 'subscription_plans', model: 'SubscriptionPlan.js' },
    { table: 'subscriptions', model: 'Subscription.js' },
    { table: 'agencies', model: 'Agency.js' },
    { table: 'territories', model: 'Territory.js' },
    { table: 'leads', model: 'Lead.js' },
    { table: 'users', model: 'User.js' },
    { table: 'portals', model: 'Portal.js' }
  ];

  const issues = [];

  for (const {table, model} of tablesToCheck) {
    console.log(`\n📋 Checking ${table.toUpperCase()}...`);
    
    try {
      // Get database columns
      const { data, error } = await supabase.from(table).select('*').limit(1);
      
      if (error) {
        console.log(`   ❌ Cannot access table: ${error.message}`);
        continue;
      }

      const dbColumns = data && data[0] ? Object.keys(data[0]) : [];
      console.log(`   Database columns (${dbColumns.length}): ${dbColumns.join(', ')}`);

      // Read model file
      const modelPath = path.join(__dirname, '..', 'models', model);
      if (!fs.existsSync(modelPath)) {
        console.log(`   ⚠️  Model file not found`);
        continue;
      }

      const modelContent = fs.readFileSync(modelPath, 'utf8');

      // Extract expected columns from model
      const modelColumns = [];
      
      // Find all field definitions with explicit field mapping
      const fieldMatches = modelContent.matchAll(/(\w+):\s*{[^}]*field:\s*['"](\w+)['"]/g);
      for (const match of fieldMatches) {
        const dbField = match[2];
        modelColumns.push(dbField);
      }

      // Find fields without explicit mapping (they use same name)
      const directFields = modelContent.matchAll(/(\w+):\s*{\s*type:\s*DataTypes/g);
      for (const match of directFields) {
        const fieldName = match[1];
        // Skip if already has explicit mapping
        const hasMapping = modelContent.includes(`${fieldName}:`) && modelContent.includes(`field:`);
        if (!hasMapping && !['type', 'allowNull', 'defaultValue', 'validate'].includes(fieldName)) {
          // Convert camelCase to snake_case
          const snakeCase = fieldName.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
          if (!modelColumns.includes(snakeCase)) {
            modelColumns.push(snakeCase);
          }
        }
      }

      // Also check tableName and timestamps
      const tableNameMatch = modelContent.match(/tableName:\s*['"](\w+)['"]/);
      const createdAtMatch = modelContent.match(/createdAt:\s*['"](\w+)['"]/);
      const updatedAtMatch = modelContent.match(/updatedAt:\s*['"](\w+)['"]/);

      if (createdAtMatch) modelColumns.push(createdAtMatch[1]);
      if (updatedAtMatch) modelColumns.push(updatedAtMatch[1]);

      console.log(`   Model expects (${modelColumns.length}): ${modelColumns.join(', ')}`);

      // Find mismatches
      const missingInDb = modelColumns.filter(col => !dbColumns.includes(col));
      const extraInDb = dbColumns.filter(col => !modelColumns.includes(col) && col !== 'id');

      if (missingInDb.length > 0) {
        console.log(`   ❌ Missing in database: ${missingInDb.join(', ')}`);
        issues.push({ table, type: 'missing_in_db', columns: missingInDb });
      }

      if (extraInDb.length > 0) {
        console.log(`   ⚠️  Extra in database (not in model): ${extraInDb.join(', ')}`);
        issues.push({ table, type: 'extra_in_db', columns: extraInDb });
      }

      if (missingInDb.length === 0 && extraInDb.length === 0) {
        console.log(`   ✅ Perfect match!`);
      }

    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`);
    }
  }

  console.log('\n\n========================================');
  console.log('SUMMARY');
  console.log('========================================\n');

  if (issues.length === 0) {
    console.log('✅ ALL TABLES MATCH THEIR MODELS PERFECTLY!');
  } else {
    console.log('❌ ISSUES FOUND:\n');
    
    const missingIssues = issues.filter(i => i.type === 'missing_in_db');
    const extraIssues = issues.filter(i => i.type === 'extra_in_db');

    if (missingIssues.length > 0) {
      console.log('📋 Columns Missing in Database:');
      missingIssues.forEach(issue => {
        console.log(`   ${issue.table}: ${issue.columns.join(', ')}`);
      });
    }

    if (extraIssues.length > 0) {
      console.log('\n⚠️  Extra/Unused Columns in Database:');
      extraIssues.forEach(issue => {
        console.log(`   ${issue.table}: ${issue.columns.join(', ')}`);
      });
    }

    console.log('\n\n📝 ACTIONS REQUIRED:');
    
    if (missingIssues.some(i => i.table === 'subscription_plans')) {
      console.log('\n1. ✅ Execute FIX_SUBSCRIPTION_PLANS_TABLE.sql');
      console.log('   - Adds missing columns');
      console.log('   - Migrates data from old columns');
      console.log('   - Removes old columns');
    }

    if (extraIssues.length > 0) {
      console.log('\n2. Review extra columns and decide:');
      console.log('   - Update models to include them');
      console.log('   - OR remove them from database');
    }
  }

  // Save detailed report
  fs.writeFileSync(
    'DATABASE_MODEL_COMPARISON.json', 
    JSON.stringify(issues, null, 2)
  );
  console.log('\n📄 Detailed report: DATABASE_MODEL_COMPARISON.json');
}

compareAllTables();
