/**
 * API Connection Audit Script
 * Validates all route → controller → service connections
 */

const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, '../routes');
const controllersDir = path.join(__dirname, '../controllers');
const servicesDir = path.join(__dirname, '../services');
const serverFile = path.join(__dirname, '../server.js');

const issues = [];
const connections = [];

// Read server.js to find registered routes
const serverContent = fs.readFileSync(serverFile, 'utf8');

// Extract route registrations
const routeRegistrations = [];
const requireMatches = serverContent.matchAll(/require\(['"](\.\/routes\/[^'"]+)['"]\)/g);
const useMatches = serverContent.matchAll(/app\.use\(['"]([^'"]+)['"],\s*([^)]+Routes)/g);

// Get all route files
const routeFiles = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

console.log('🔍 AUDITING API CONNECTIONS...\n');

// Check each route file
routeFiles.forEach(routeFile => {
  const routePath = path.join(routesDir, routeFile);
  const routeContent = fs.readFileSync(routePath, 'utf8');
  
  // Extract controller requires
  const controllerMatches = routeContent.matchAll(/require\(['"](\.\.\/controllers\/[^'"]+)['"]\)/g);
  const serviceMatches = routeContent.matchAll(/require\(['"](\.\.\/services\/[^'"]+)['"]\)/g);
  
  const controllers = Array.from(controllerMatches).map(m => m[1]);
  const services = Array.from(serviceMatches).map(m => m[1]);
  
  // Extract route definitions
  const routeDefs = routeContent.matchAll(/router\.(get|post|put|delete|patch)\(['"]([^'"]+)['"],\s*([^,)]+)\)/g);
  const routes = Array.from(routeDefs).map(m => ({
    method: m[1].toUpperCase(),
    path: m[2],
    handler: m[3].trim()
  }));
  
  // Check if route file is registered in server.js
  const routeName = routeFile.replace('.js', '');
  const routeVarName = routeName.charAt(0).toLowerCase() + routeName.slice(1).replace(/Routes$/, '') + 'Routes';
  const isRegistered = 
    serverContent.includes(`require('./routes/${routeFile}')`) || 
    serverContent.includes(`require("./routes/${routeFile}")`) ||
    serverContent.includes(`${routeVarName}`) ||
    serverContent.includes(`./routes/${routeFile}`);
  
  if (!isRegistered && routeFile !== 'metricsRoutes.js') {
    issues.push({
      type: 'UNREGISTERED_ROUTE',
      file: routeFile,
      severity: 'HIGH',
      message: `Route file ${routeFile} is not registered in server.js`
    });
  }
  
  // Check controllers exist
  controllers.forEach(controllerPath => {
    const controllerFile = path.basename(controllerPath);
    const controllerFullPath = path.join(__dirname, '..', controllerPath);
    
    if (!fs.existsSync(controllerFullPath)) {
      issues.push({
        type: 'MISSING_CONTROLLER',
        file: routeFile,
        controller: controllerFile,
        severity: 'HIGH',
        message: `Controller ${controllerFile} referenced in ${routeFile} does not exist`
      });
    } else {
      // Check if controller exports the functions used
      const controllerContent = fs.readFileSync(controllerFullPath, 'utf8');
      routes.forEach(route => {
        const handlerName = route.handler.split('.')[0];
        const functionName = route.handler.includes('.') ? route.handler.split('.')[1] : null;
        
        if (functionName) {
          // Check if function exists in controller
          const funcPattern = new RegExp(`(?:exports\\.|module\\.exports\\.|\\bfunction\\s+)${functionName}\\s*[=(]`, 'i');
          const classMethodPattern = new RegExp(`(?:async\\s+)?${functionName}\\s*\\(`, 'i');
          
          if (!funcPattern.test(controllerContent) && !classMethodPattern.test(controllerContent)) {
            issues.push({
              type: 'MISSING_FUNCTION',
              file: routeFile,
              controller: controllerFile,
              function: functionName,
              route: `${route.method} ${route.path}`,
              severity: 'HIGH',
              message: `Function ${functionName} not found in controller ${controllerFile}`
            });
          }
        }
      });
    }
  });
  
  // Check services exist
  services.forEach(servicePath => {
    const serviceFile = path.basename(servicePath);
    const serviceFullPath = path.join(__dirname, '..', servicePath);
    
    if (!fs.existsSync(serviceFullPath)) {
      issues.push({
        type: 'MISSING_SERVICE',
        file: routeFile,
        service: serviceFile,
        severity: 'MEDIUM',
        message: `Service ${serviceFile} referenced in ${routeFile} does not exist`
      });
    }
  });
  
  connections.push({
    routeFile,
    isRegistered,
    controllers: [...new Set(controllers)],
    services: [...new Set(services)],
    routeCount: routes.length
  });
});

// Generate report
console.log('📊 CONNECTION AUDIT RESULTS\n');
console.log(`Total Route Files: ${routeFiles.length}`);
console.log(`Total Connections: ${connections.length}`);
console.log(`Issues Found: ${issues.length}\n`);

if (issues.length > 0) {
  console.log('❌ ISSUES FOUND:\n');
  
  const bySeverity = {
    HIGH: [],
    MEDIUM: [],
    LOW: []
  };
  
  issues.forEach(issue => {
    bySeverity[issue.severity].push(issue);
  });
  
  Object.keys(bySeverity).forEach(severity => {
    if (bySeverity[severity].length > 0) {
      console.log(`\n${severity} SEVERITY (${bySeverity[severity].length}):`);
      bySeverity[severity].forEach(issue => {
        console.log(`  [${issue.type}] ${issue.message}`);
        if (issue.route) console.log(`    Route: ${issue.route}`);
      });
    }
  });
} else {
  console.log('✅ No issues found!\n');
}

console.log('\n📋 CONNECTION SUMMARY:\n');
connections.forEach(conn => {
  const status = conn.isRegistered ? '✅' : '❌';
  console.log(`${status} ${conn.routeFile}`);
  console.log(`   Registered: ${conn.isRegistered}`);
  console.log(`   Routes: ${conn.routeCount}`);
  console.log(`   Controllers: ${conn.controllers.length}`);
  console.log(`   Services: ${conn.services.length}`);
});

// Save report
const report = {
  timestamp: new Date().toISOString(),
  totalRoutes: routeFiles.length,
  totalConnections: connections.length,
  issues: issues,
  connections: connections
};

fs.writeFileSync(
  path.join(__dirname, '../API_CONNECTION_AUDIT.json'),
  JSON.stringify(report, null, 2)
);

console.log('\n📄 Report saved to API_CONNECTION_AUDIT.json');
console.log('\n✅ Audit complete!\n');

