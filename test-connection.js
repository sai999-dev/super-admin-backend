/**
 * Quick connection test script
 * Tests if the server is accessible from the network
 */

const http = require('http');
const os = require('os');

// Get local IP address
function getLocalIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const localIP = getLocalIPAddress();
const ports = [3002, 3000, 3001, 5000];

console.log('🔍 Testing server connectivity...\n');
console.log(`📍 Your local IP address: ${localIP}\n`);

async function testEndpoint(host, port, path) {
  return new Promise((resolve) => {
    const options = {
      hostname: host,
      port: port,
      path: path,
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          success: true,
          status: res.statusCode,
          data: data.substring(0, 100)
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        success: false,
        error: err.message
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        success: false,
        error: 'Connection timeout'
      });
    });

    req.end();
  });
}

async function runTests() {
  console.log('Testing localhost connections:\n');
  for (const port of ports) {
    const result = await testEndpoint('localhost', port, '/api/health');
    if (result.success) {
      console.log(`✅ Port ${port} (localhost): Working - Status ${result.status}`);
    } else {
      console.log(`❌ Port ${port} (localhost): ${result.error}`);
    }
  }

  console.log('\n\nTesting network connections:\n');
  for (const port of ports) {
    const result = await testEndpoint(localIP, port, '/api/health');
    if (result.success) {
      console.log(`✅ Port ${port} (${localIP}): Working - Status ${result.status}`);
    } else {
      console.log(`❌ Port ${port} (${localIP}): ${result.error}`);
    }
  }

  console.log('\n\n💡 For your Flutter app, use:');
  console.log(`   http://${localIP}:5000/api/mobile/auth/login`);
  console.log(`   or`);
  console.log(`   http://${localIP}:3002/api/mobile/auth/login`);
}

runTests().catch(console.error);


