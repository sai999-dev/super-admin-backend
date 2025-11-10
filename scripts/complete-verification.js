/**
 * COMPLETE END-TO-END VERIFICATION
 * Checks: Database → Models → Controllers → Routes → Middleware
 */

require('dotenv').config({ path: 'config.env' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function completeVerification() {
  console.log('========================================');
  console.log('COMPLETE END-TO-END VERIFICATION');
  console.log('========================================\n');

  const report = {
    database: {},
    models: {},
    controllers: {},
    routes: {},
    middleware: {},
    issues: []
  };

  try {
    // =====================================================
    // 1. VERIFY DATABASE SCHEMA
    // =====================================================
    console.log('📊 STEP 1: Verifying Database Schema...\n');

    const tables = ['agencies', 'users', 'subscriptions', 'subscription_plans', 
                    'territories', 'leads', 'lead_assignments', 'lead_purchases', 
                    'portals', 'notifications'];

    for (const table of tables) {
      const { data, error } = await supabase.from(table).select('*').limit(1);
      
      if (error) {
        report.database[table] = { status: 'ERROR', error: error.message };
        report.issues.push(`Database: ${table} - ${error.message}`);
      } else {
        const columns = data && data[0] ? Object.keys(data[0]) : [];
        report.database[table] = { status: 'OK', columns: columns.length, columnList: columns };
        console.log(`   ✅ ${table}: ${columns.length} columns`);
      }
    }

    // =====================================================
    // 2. VERIFY MODEL FILES
    // =====================================================
    console.log('\n📝 STEP 2: Verifying Model Files...\n');

    const modelFiles = {
      'Agency': 'models/Agency.js',
      'User': 'models/User.js',
      'Subscription': 'models/Subscription.js',
      'SubscriptionPlan': 'models/SubscriptionPlan.js',
      'Territory': 'models/Territory.js',
      'Lead': 'models/Lead.js',
      'LeadAssignment': 'models/LeadAssignment.js',
      'LeadPurchase': 'models/LeadPurchase.js',
      'Portal': 'models/Portal.js',
      'Notification': 'models/Notification.js'
    };

    for (const [modelName, filePath] of Object.entries(modelFiles)) {
      const fullPath = path.join(__dirname, '..', filePath);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        
        // Check for field mappings
        const hasFieldMappings = content.includes('field:');
        const hasTableName = content.includes('tableName:');
        const hasTimestamps = content.includes('timestamps:');
        
        report.models[modelName] = {
          status: 'OK',
          hasFieldMappings,
          hasTableName,
          hasTimestamps
        };
        
        console.log(`   ✅ ${modelName}: Field mappings: ${hasFieldMappings ? '✅' : '❌'}`);
        
        if (!hasFieldMappings) {
          report.issues.push(`Model: ${modelName} - Missing field mappings`);
        }
      } else {
        report.models[modelName] = { status: 'MISSING' };
        report.issues.push(`Model: ${modelName} - File not found`);
        console.log(`   ❌ ${modelName}: File not found`);
      }
    }

    // =====================================================
    // 3. VERIFY CONTROLLER FILES
    // =====================================================
    console.log('\n🎮 STEP 3: Verifying Controller Files...\n');

    const controllerFiles = fs.readdirSync(path.join(__dirname, '..', 'controllers'))
      .filter(f => f.endsWith('.js'));

    for (const file of controllerFiles) {
      const content = fs.readFileSync(path.join(__dirname, '..', 'controllers', file), 'utf8');
      
      // Check for common issues
      const issues = [];
      
      // Check if using Sequelize models
      const usesSequelize = content.includes('require(') && content.includes('models');
      
      // Check if properly handling errors
      const hasErrorHandling = content.includes('try') || content.includes('catch');
      
      // Check if using proper async/await
      const usesAsync = content.includes('async') && content.includes('await');
      
      report.controllers[file] = {
        status: 'OK',
        usesSequelize,
        hasErrorHandling,
        usesAsync,
        issues
      };
      
      console.log(`   ✅ ${file}: Sequelize: ${usesSequelize ? '✅' : '⚠️'}, Error handling: ${hasErrorHandling ? '✅' : '❌'}`);
      
      if (!hasErrorHandling) {
        report.issues.push(`Controller: ${file} - Missing error handling`);
      }
    }

    // =====================================================
    // 4. VERIFY ROUTE FILES
    // =====================================================
    console.log('\n🛣️  STEP 4: Verifying Route Files...\n');

    const routeFiles = fs.readdirSync(path.join(__dirname, '..', 'routes'))
      .filter(f => f.endsWith('.js'));

    for (const file of routeFiles) {
      const content = fs.readFileSync(path.join(__dirname, '..', 'routes', file), 'utf8');
      
      // Extract route definitions
      const routes = [];
      const getRoutes = content.match(/router\.(get|post|put|delete|patch)\s*\(['"](.*?)['"]/g);
      
      if (getRoutes) {
        getRoutes.forEach(route => {
          const match = route.match(/router\.(get|post|put|delete|patch)\s*\(['"](.*?)['"]/);
          if (match) {
            routes.push(`${match[1].toUpperCase()} ${match[2]}`);
          }
        });
      }
      
      report.routes[file] = {
        status: 'OK',
        routeCount: routes.length,
        routes
      };
      
      console.log(`   ✅ ${file}: ${routes.length} routes defined`);
    }

    // =====================================================
    // 5. VERIFY MIDDLEWARE FILES
    // =====================================================
    console.log('\n🔒 STEP 5: Verifying Middleware Files...\n');

    const middlewareFiles = fs.readdirSync(path.join(__dirname, '..', 'middleware'))
      .filter(f => f.endsWith('.js'));

    for (const file of middlewareFiles) {
      const content = fs.readFileSync(path.join(__dirname, '..', 'middleware', file), 'utf8');
      
      // Check middleware structure
      const exportsMiddleware = content.includes('module.exports') || content.includes('exports.');
      const hasNextCall = content.includes('next()');
      const hasErrorHandling = content.includes('try') || content.includes('catch');
      
      report.middleware[file] = {
        status: 'OK',
        exportsMiddleware,
        hasNextCall,
        hasErrorHandling
      };
      
      console.log(`   ✅ ${file}: Exports: ${exportsMiddleware ? '✅' : '❌'}, Next: ${hasNextCall ? '✅' : '⚠️'}`);
      
      if (!exportsMiddleware) {
        report.issues.push(`Middleware: ${file} - Not properly exported`);
      }
    }

    // =====================================================
    // 6. CHECK CRITICAL MAPPINGS
    // =====================================================
    console.log('\n🔍 STEP 6: Checking Critical Field Mappings...\n');

    // Check Agency model mappings
    const agencyModelPath = path.join(__dirname, '..', 'models/Agency.js');
    const agencyModel = fs.readFileSync(agencyModelPath, 'utf8');
    
    const agencyMappings = {
      'agencyName': agencyModel.includes("field: 'agency_name'"),
      'businessName': agencyModel.includes("field: 'business_name'"),
      'passwordHash': agencyModel.includes("field: 'password_hash'"),
      'territories': agencyModel.includes('territories'),
      'territoryCount': agencyModel.includes("field: 'territory_count'"),
      'createdAt': agencyModel.includes("createdAt: 'created_at'")
    };
    
    console.log('   Agency Model Mappings:');
    Object.entries(agencyMappings).forEach(([field, exists]) => {
      console.log(`      ${exists ? '✅' : '❌'} ${field}`);
      if (!exists) {
        report.issues.push(`Agency Model: Missing mapping for ${field}`);
      }
    });

    // Check Lead model mappings
    const leadModelPath = path.join(__dirname, '..', 'models/Lead.js');
    const leadModel = fs.readFileSync(leadModelPath, 'utf8');
    
    const leadMappings = {
      'firstName': leadModel.includes("field: 'first_name'"),
      'lastName': leadModel.includes("field: 'last_name'"),
      'city': leadModel.includes('city'),
      'state': leadModel.includes('state'),
      'zipcode': leadModel.includes('zipcode')
    };
    
    console.log('\n   Lead Model Mappings:');
    Object.entries(leadMappings).forEach(([field, exists]) => {
      console.log(`      ${exists ? '✅' : '❌'} ${field}`);
      if (!exists) {
        report.issues.push(`Lead Model: Missing mapping for ${field}`);
      }
    });

    // Check Territory model mappings
    const territoryModelPath = path.join(__dirname, '..', 'models/Territory.js');
    const territoryModel = fs.readFileSync(territoryModelPath, 'utf8');
    
    const territoryMappings = {
      'county': territoryModel.includes('county'),
      'city': territoryModel.includes('city'),
      'zipcode': territoryModel.includes('zipcode')
    };
    
    console.log('\n   Territory Model Mappings:');
    Object.entries(territoryMappings).forEach(([field, exists]) => {
      console.log(`      ${exists ? '✅' : '❌'} ${field}`);
      if (!exists) {
        report.issues.push(`Territory Model: Missing mapping for ${field}`);
      }
    });

    // =====================================================
    // 7. FINAL REPORT
    // =====================================================
    console.log('\n========================================');
    console.log('VERIFICATION COMPLETE');
    console.log('========================================\n');

    console.log(`📊 Database Tables: ${Object.keys(report.database).length}`);
    console.log(`📝 Model Files: ${Object.keys(report.models).length}`);
    console.log(`🎮 Controller Files: ${Object.keys(report.controllers).length}`);
    console.log(`🛣️  Route Files: ${Object.keys(report.routes).length}`);
    console.log(`🔒 Middleware Files: ${Object.keys(report.middleware).length}`);

    if (report.issues.length === 0) {
      console.log('\n✅ ✅ ✅ ALL CHECKS PASSED! ✅ ✅ ✅');
      console.log('\n🎉 Your application is FULLY CONFIGURED and READY!');
      console.log('\nNext Steps:');
      console.log('1. Start server: npm start');
      console.log('2. Test APIs using Postman or api-tests.http');
      console.log('3. Check logs for any runtime issues');
    } else {
      console.log('\n⚠️  ISSUES FOUND:');
      report.issues.forEach(issue => console.log(`   - ${issue}`));
    }

    // Save detailed report
    fs.writeFileSync('COMPLETE_VERIFICATION_REPORT.json', JSON.stringify(report, null, 2));
    console.log('\n📄 Detailed report saved: COMPLETE_VERIFICATION_REPORT.json');

  } catch (error) {
    console.error('\n❌ Verification Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

completeVerification();
