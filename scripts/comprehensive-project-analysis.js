/**
 * Comprehensive End-to-End Project Analysis
 * Analyzes entire backend: routes, controllers, models, migrations, configurations
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Starting Comprehensive End-to-End Project Analysis...\n');
console.log('='.repeat(80));

const analysis = {
  timestamp: new Date().toISOString(),
  routes: [],
  controllers: [],
  models: [],
  migrations: [],
  services: [],
  middleware: [],
  issues: [],
  warnings: [],
  stats: {}
};

// =====================================================
// 1. ANALYZE ROUTES
// =====================================================
console.log('\n📋 Analyzing Routes...\n');

const routesDir = path.join(__dirname, '..', 'routes');
const routeFiles = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

routeFiles.forEach(file => {
  const filePath = path.join(routesDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Extract route definitions
  const routes = [];
  const routePatterns = [
    /router\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g,
    /app\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g
  ];
  
  routePatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      routes.push({
        method: match[1].toUpperCase(),
        path: match[2],
        file: file
      });
    }
  });
  
  // Extract middleware usage
  const middlewareUsed = [];
  const middlewarePattern = /(authenticateAdmin|authenticateAgency|agencyAuth|adminAuth)/g;
  let middlewareMatch;
  while ((middlewareMatch = middlewarePattern.exec(content)) !== null) {
    if (!middlewareUsed.includes(middlewareMatch[1])) {
      middlewareUsed.push(middlewareMatch[1]);
    }
  }
  
  analysis.routes.push({
    file: file,
    routes: routes,
    middleware: middlewareUsed,
    routeCount: routes.length,
    hasAuth: middlewareUsed.length > 0
  });
  
  console.log(`   ✅ ${file}: ${routes.length} endpoints${middlewareUsed.length > 0 ? ' (protected)' : ''}`);
});

const totalRoutes = analysis.routes.reduce((sum, r) => sum + r.routeCount, 0);
analysis.stats.totalEndpoints = totalRoutes;
console.log(`\n   📊 Total Endpoints: ${totalRoutes}`);

// =====================================================
// 2. ANALYZE CONTROLLERS
// =====================================================
console.log('\n🎮 Analyzing Controllers...\n');

const controllersDir = path.join(__dirname, '..', 'controllers');
const controllerFiles = fs.readdirSync(controllersDir).filter(f => f.endsWith('.js'));

controllerFiles.forEach(file => {
  const filePath = path.join(controllersDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Check for exports
  const hasExports = content.includes('module.exports') || content.includes('exports.');
  
  // Check for async functions
  const asyncFunctions = (content.match(/async\s+(function|\(|\w+)/g) || []).length;
  
  // Check for error handling
  const hasTryCatch = content.includes('try') && content.includes('catch');
  
  // Check for Supabase usage
  const usesSupabase = content.includes('supabase') || content.includes('Supabase');
  
  analysis.controllers.push({
    file: file,
    hasExports: hasExports,
    asyncFunctions: asyncFunctions,
    hasErrorHandling: hasTryCatch,
    usesSupabase: usesSupabase,
    lines: content.split('\n').length
  });
  
  const status = hasExports ? '✅' : '⚠️';
  console.log(`   ${status} ${file} (${asyncFunctions} async functions, ${hasTryCatch ? 'error handling' : 'no error handling'})`);
});

analysis.stats.totalControllers = controllerFiles.length;

// =====================================================
// 3. ANALYZE MODELS
// =====================================================
console.log('\n📦 Analyzing Models...\n');

const modelsDir = path.join(__dirname, '..', 'models');
const modelFiles = fs.readdirSync(modelsDir).filter(f => f.endsWith('.js') && f !== 'index.js');

modelFiles.forEach(file => {
  const filePath = path.join(modelsDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Extract model name
  const modelNameMatch = content.match(/sequelize\.define\(['"`](\w+)['"`]/);
  const modelName = modelNameMatch ? modelNameMatch[1] : 'Unknown';
  
  // Check for tableName
  const tableNameMatch = content.match(/tableName:\s*['"`]([^'"`]+)['"`]/);
  const tableName = tableNameMatch ? tableNameMatch[1] : null;
  
  // Check for associations
  const hasAssociations = content.includes('associate') || content.includes('belongsTo') || content.includes('hasMany');
  
  analysis.models.push({
    file: file,
    modelName: modelName,
    tableName: tableName,
    hasAssociations: hasAssociations
  });
  
  console.log(`   ✅ ${modelName} → ${tableName || 'no table name'}`);
});

analysis.stats.totalModels = modelFiles.length;

// =====================================================
// 4. ANALYZE MIGRATIONS
// =====================================================
console.log('\n🗄️  Analyzing Migrations...\n');

const migrationsDir = path.join(__dirname, '..', 'migrations');
const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

migrationFiles.forEach(file => {
  const filePath = path.join(migrationsDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Extract CREATE TABLE statements
  const createTables = (content.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_]+)/gi) || [])
    .map(m => m.replace(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?/i, '').toLowerCase());
  
  // Check for RLS
  const hasRLS = content.includes('ENABLE ROW LEVEL SECURITY') || content.includes('ENABLE RLS');
  
  // Check for indexes
  const indexCount = (content.match(/CREATE\s+INDEX/i) || []).length;
  
  analysis.migrations.push({
    file: file,
    tablesCreated: [...new Set(createTables)],
    hasRLS: hasRLS,
    indexCount: indexCount,
    size: content.length
  });
  
  console.log(`   ✅ ${file}: ${createTables.length} tables${hasRLS ? ', RLS' : ''}${indexCount > 0 ? `, ${indexCount} indexes` : ''}`);
});

analysis.stats.totalMigrations = migrationFiles.length;

// =====================================================
// 5. ANALYZE SERVICES
// =====================================================
console.log('\n⚙️  Analyzing Services...\n');

const servicesDir = path.join(__dirname, '..', 'services');
if (fs.existsSync(servicesDir)) {
  const serviceFiles = fs.readdirSync(servicesDir).filter(f => f.endsWith('.js'));
  
  serviceFiles.forEach(file => {
    const filePath = path.join(servicesDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check for exports
    const hasExports = content.includes('module.exports') || content.includes('exports.');
    
    // Check for async functions
    const asyncFunctions = (content.match(/async\s+(function|\(|\w+)/g) || []).length;
    
    analysis.services.push({
      file: file,
      hasExports: hasExports,
      asyncFunctions: asyncFunctions,
      lines: content.split('\n').length
    });
    
    console.log(`   ✅ ${file} (${asyncFunctions} async functions)`);
  });
  
  analysis.stats.totalServices = serviceFiles.length;
} else {
  console.log('   ⚠️  Services directory not found');
}

// =====================================================
// 6. ANALYZE MIDDLEWARE
// =====================================================
console.log('\n🛡️  Analyzing Middleware...\n');

const middlewareDir = path.join(__dirname, '..', 'middleware');
const middlewareFiles = fs.readdirSync(middlewareDir).filter(f => f.endsWith('.js'));

middlewareFiles.forEach(file => {
  const filePath = path.join(middlewareDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Check for JWT usage
  const usesJWT = content.includes('jsonwebtoken') || content.includes('jwt.verify');
  
  // Check for exports
  const hasExports = content.includes('module.exports') || content.includes('exports.');
  
  analysis.middleware.push({
    file: file,
    usesJWT: usesJWT,
    hasExports: hasExports,
    lines: content.split('\n').length
  });
  
  console.log(`   ✅ ${file}${usesJWT ? ' (JWT auth)' : ''}`);
});

analysis.stats.totalMiddleware = middlewareFiles.length;

// =====================================================
// 7. CHECK FOR ISSUES
// =====================================================
console.log('\n🔍 Checking for Issues...\n');

// Check routes without authentication
const unprotectedRoutes = analysis.routes.filter(r => !r.hasAuth && r.routes.length > 0);
if (unprotectedRoutes.length > 0) {
  analysis.warnings.push({
    type: 'unprotected_routes',
    message: `Found ${unprotectedRoutes.length} route files without authentication`,
    files: unprotectedRoutes.map(r => r.file)
  });
  console.log(`   ⚠️  ${unprotectedRoutes.length} route files may need authentication`);
}

// Check controllers without error handling
const controllersWithoutErrorHandling = analysis.controllers.filter(c => !c.hasErrorHandling);
if (controllersWithoutErrorHandling.length > 0) {
  analysis.warnings.push({
    type: 'missing_error_handling',
    message: `Found ${controllersWithoutErrorHandling.length} controllers without try-catch`,
    files: controllersWithoutErrorHandling.map(c => c.file)
  });
  console.log(`   ⚠️  ${controllersWithoutErrorHandling.length} controllers may need error handling`);
}

// Check for console.log in production code
const routesWithConsoleLog = analysis.routes.filter(r => {
  const filePath = path.join(routesDir, r.file);
  const content = fs.readFileSync(filePath, 'utf8');
  return content.includes('console.log') || content.includes('console.error');
});
if (routesWithConsoleLog.length > 0) {
  analysis.warnings.push({
    type: 'console_logs',
    message: `Found ${routesWithConsoleLog.length} route files with console.log`,
    files: routesWithConsoleLog.map(r => r.file)
  });
  console.log(`   ⚠️  ${routesWithConsoleLog.length} route files contain console.log (consider using logger)`);
}

// =====================================================
// 8. CHECK CONFIGURATION
// =====================================================
console.log('\n⚙️  Checking Configuration...\n');

const configDir = path.join(__dirname, '..', 'config');
if (fs.existsSync(configDir)) {
  const configFiles = fs.readdirSync(configDir).filter(f => f.endsWith('.js'));
  console.log(`   ✅ Config files: ${configFiles.join(', ')}`);
  
  // Check for environment variables
  const configFilesContent = configFiles.map(f => {
    const filePath = path.join(configDir, f);
    return {
      file: f,
      content: fs.readFileSync(filePath, 'utf8')
    };
  });
  
  const envVarsUsed = new Set();
  configFilesContent.forEach(cf => {
    const matches = cf.content.match(/process\.env\.(\w+)/g);
    if (matches) {
      matches.forEach(m => envVarsUsed.add(m.replace('process.env.', '')));
    }
  });
  
  if (envVarsUsed.size > 0) {
    console.log(`   📝 Environment variables used: ${Array.from(envVarsUsed).join(', ')}`);
  }
}

// =====================================================
// 9. CHECK PACKAGE.JSON
// =====================================================
console.log('\n📦 Checking Dependencies...\n');

const packageJsonPath = path.join(__dirname, '..', 'package.json');
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  console.log(`   ✅ Dependencies: ${Object.keys(packageJson.dependencies || {}).length}`);
  console.log(`   ✅ Scripts: ${Object.keys(packageJson.scripts || {}).length}`);
  
  analysis.stats.dependencies = Object.keys(packageJson.dependencies || {}).length;
  analysis.stats.scripts = Object.keys(packageJson.scripts || {}).length;
}

// =====================================================
// 10. GENERATE SUMMARY
// =====================================================
console.log('\n' + '='.repeat(80));
console.log('📊 COMPREHENSIVE ANALYSIS SUMMARY');
console.log('='.repeat(80));

console.log(`\n✅ Routes: ${analysis.stats.totalEndpoints} endpoints across ${analysis.routes.length} files`);
console.log(`✅ Controllers: ${analysis.stats.totalControllers} files`);
console.log(`✅ Models: ${analysis.stats.totalModels} models`);
console.log(`✅ Migrations: ${analysis.stats.totalMigrations} files`);
console.log(`✅ Services: ${analysis.stats.totalServices || 0} files`);
console.log(`✅ Middleware: ${analysis.stats.totalMiddleware} files`);

if (analysis.warnings.length > 0) {
  console.log(`\n⚠️  Warnings: ${analysis.warnings.length}`);
  analysis.warnings.forEach(w => {
    console.log(`   - ${w.type}: ${w.message}`);
  });
}

// =====================================================
// 11. SAVE REPORT
// =====================================================
const reportPath = path.join(__dirname, '..', 'COMPREHENSIVE_ANALYSIS_REPORT.json');
fs.writeFileSync(reportPath, JSON.stringify(analysis, null, 2));

console.log(`\n📄 Detailed report saved to: COMPREHENSIVE_ANALYSIS_REPORT.json`);
console.log('\n✅ Analysis complete!\n');

