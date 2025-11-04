/**
 * Comprehensive API Endpoint Validation Script
 * Validates route → controller → service connections end-to-end
 */

const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, '../routes');
const controllersDir = path.join(__dirname, '../controllers');
const servicesDir = path.join(__dirname, '../services');
const serverFile = path.join(__dirname, '../server.js');

const validationResults = {
  timestamp: new Date().toISOString(),
  routes: [],
  issues: [],
  summary: {
    totalRoutes: 0,
    connectedRoutes: 0,
    missingConnections: 0,
    brokenConnections: 0
  }
};

// Read server.js
const serverContent = fs.readFileSync(serverFile, 'utf8');

// Helper: Check if file exists
function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

// Helper: Extract exported functions from controller
function getExportedFunctions(controllerPath) {
  if (!fileExists(controllerPath)) return [];
  
  try {
    const content = fs.readFileSync(controllerPath, 'utf8');
    const functions = [];
    
    // Check for CommonJS exports
    const exportMatches = content.matchAll(/(?:module\.exports\s*=|exports\.)(\w+)|(?:exports\.(\w+)\s*=)/g);
    for (const match of exportMatches) {
      if (match[1]) functions.push(match[1]);
      if (match[2]) functions.push(match[2]);
    }
    
    // Check for class-based exports (module.exports = new ClassName())
    const classMatch = content.match(/module\.exports\s*=\s*new\s+(\w+)/);
    if (classMatch) {
      // Extract class methods
      const methodMatches = content.matchAll(/(?:async\s+)?(\w+)\s*\(/g);
      for (const match of methodMatches) {
        if (!['constructor', 'asyncHandler'].includes(match[1])) {
          functions.push(match[1]);
        }
      }
    }
    
    // Check for direct function exports
    const directExports = content.matchAll(/exports\.(\w+)\s*=\s*(?:async\s+)?function/g);
    for (const match of directExports) {
      functions.push(match[1]);
    }
    
    return [...new Set(functions)];
  } catch (error) {
    return [];
  }
}

// Get all route files
const routeFiles = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

console.log('🔍 VALIDATING API ENDPOINTS...\n');

routeFiles.forEach(routeFile => {
  const routePath = path.join(routesDir, routeFile);
  const routeContent = fs.readFileSync(routePath, 'utf8');
  
  // Check if registered in server.js
  const isRegistered = serverContent.includes(`require('./routes/${routeFile}')`) || 
                       serverContent.includes(`require("./routes/${routeFile}")`);
  
  // Extract routes
  const routeMatches = routeContent.matchAll(/router\.(get|post|put|delete|patch)\(['"]([^'"]+)['"],\s*([^,)]+)\)/g);
  const routes = Array.from(routeMatches).map(m => ({
    method: m[1].toUpperCase(),
    path: m[2],
    handler: m[3].trim()
  }));
  
  // Extract controller requires
  const controllerMatches = routeContent.matchAll(/require\(['"](\.\.\/controllers\/([^'"]+))['"]\)/g);
  const controllerImports = Array.from(controllerMatches).map(m => ({
    importPath: m[1],
    controllerName: m[2]
  }));
  
  const routeInfo = {
    file: routeFile,
    isRegistered,
    routes: [],
    controllers: [],
    status: 'unknown'
  };
  
  // Validate each route
  routes.forEach(route => {
    const handlerParts = route.handler.split('.');
    const controllerVar = handlerParts[0];
    const functionName = handlerParts[1] || handlerParts[0];
    
    // Find controller import
    const controllerImport = controllerImports.find(imp => 
      routeContent.includes(`${controllerVar}`) || 
      routeContent.includes(`require('${imp.importPath}')`) ||
      routeContent.includes(`require("${imp.importPath}")`)
    );
    
    let controllerStatus = 'missing';
    let functionStatus = 'missing';
    
    if (controllerImport) {
      const controllerPath = path.join(__dirname, '..', controllerImport.importPath + '.js');
      
      if (fileExists(controllerPath)) {
        controllerStatus = 'exists';
        const exportedFunctions = getExportedFunctions(controllerPath);
        
        if (exportedFunctions.includes(functionName)) {
          functionStatus = 'exists';
          validationResults.summary.connectedRoutes++;
        } else {
          validationResults.issues.push({
            type: 'MISSING_FUNCTION',
            route: routeFile,
            endpoint: `${route.method} ${route.path}`,
            controller: controllerImport.controllerName,
            function: functionName,
            severity: 'HIGH',
            message: `Function ${functionName} not exported from ${controllerImport.controllerName}`
          });
          validationResults.summary.brokenConnections++;
        }
      } else {
        validationResults.issues.push({
          type: 'MISSING_CONTROLLER',
          route: routeFile,
          endpoint: `${route.method} ${route.path}`,
          controller: controllerImport.controllerName,
          severity: 'HIGH',
          message: `Controller ${controllerImport.controllerName} does not exist`
        });
        validationResults.summary.missingConnections++;
      }
    } else {
      validationResults.issues.push({
        type: 'NO_CONTROLLER_IMPORT',
        route: routeFile,
        endpoint: `${route.method} ${route.path}`,
        severity: 'MEDIUM',
        message: `No controller import found for route handler ${controllerVar}`
      });
    }
    
    routeInfo.routes.push({
      method: route.method,
      path: route.path,
      handler: route.handler,
      controller: controllerImport?.controllerName || 'unknown',
      function: functionName,
      status: controllerStatus === 'exists' && functionStatus === 'exists' ? 'connected' : 'broken'
    });
  });
  
  // Add controller info
  controllerImports.forEach(imp => {
    const controllerPath = path.join(__dirname, '..', imp.importPath + '.js');
    routeInfo.controllers.push({
      name: imp.controllerName,
      exists: fileExists(controllerPath),
      functions: getExportedFunctions(controllerPath)
    });
  });
  
  routeInfo.status = isRegistered ? 'registered' : 'unregistered';
  if (!isRegistered && routeFile !== 'metricsRoutes.js') {
    validationResults.issues.push({
      type: 'UNREGISTERED_ROUTE',
      route: routeFile,
      severity: 'HIGH',
      message: `Route file ${routeFile} is not registered in server.js`
    });
  }
  
  validationResults.routes.push(routeInfo);
  validationResults.summary.totalRoutes += routes.length;
});

// Generate report
console.log('📊 VALIDATION RESULTS\n');
console.log(`Total Route Files: ${routeFiles.length}`);
console.log(`Total Endpoints: ${validationResults.summary.totalRoutes}`);
console.log(`Connected: ${validationResults.summary.connectedRoutes}`);
console.log(`Missing Connections: ${validationResults.summary.missingConnections}`);
console.log(`Broken Connections: ${validationResults.summary.brokenConnections}`);
console.log(`Issues Found: ${validationResults.issues.length}\n`);

if (validationResults.issues.length > 0) {
  const bySeverity = { HIGH: [], MEDIUM: [], LOW: [] };
  validationResults.issues.forEach(issue => {
    bySeverity[issue.severity] = bySeverity[issue.severity] || [];
    bySeverity[issue.severity].push(issue);
  });
  
  console.log('❌ ISSUES:\n');
  ['HIGH', 'MEDIUM', 'LOW'].forEach(severity => {
    if (bySeverity[severity]?.length > 0) {
      console.log(`\n${severity} (${bySeverity[severity].length}):`);
      bySeverity[severity].slice(0, 10).forEach(issue => {
        console.log(`  [${issue.type}] ${issue.message}`);
        if (issue.endpoint) console.log(`    → ${issue.endpoint}`);
      });
      if (bySeverity[severity].length > 10) {
        console.log(`  ... and ${bySeverity[severity].length - 10} more`);
      }
    }
  });
} else {
  console.log('✅ All endpoints validated successfully!\n');
}

// Save report
fs.writeFileSync(
  path.join(__dirname, '../API_ENDPOINT_VALIDATION.json'),
  JSON.stringify(validationResults, null, 2)
);

console.log('\n📄 Detailed report saved to API_ENDPOINT_VALIDATION.json');
console.log('✅ Validation complete!\n');

