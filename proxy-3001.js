/**
 * Simple HTTP proxy server on port 3001
 * Forwards all requests to the main server on port 3000
 * This allows Flutter web app to connect on port 3001
 */

const http = require('http');
const httpProxy = require('http-proxy');

const proxy = httpProxy.createProxyServer({
  target: 'http://localhost:3000',
  changeOrigin: true
});

const server = http.createServer((req, res) => {
  // Add CORS headers - allow all origins for Flutter frontend compatibility
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  proxy.web(req, res);
});

proxy.on('error', (err, req, res) => {
  console.error('Proxy error:', err);
  if (!res.headersSent) {
    res.writeHead(500, {
      'Content-Type': 'text/plain',
      'Access-Control-Allow-Origin': '*'
    });
    res.end('Proxy error: ' + err.message);
  }
});

server.listen(3001, () => {
  console.log('🔄 Proxy server running on port 3001');
  console.log('   Forwarding all requests to http://localhost:3000');
  console.log('✅ CORS enabled for health-check/proxy server');
});

