#!/usr/bin/env node

/**
 * Admin API smoke test
 * Verifies core active subscription endpoints respond successfully.
 */

const path = require('path');
const { spawn } = require('child_process');
const dotenv = require('dotenv');

// Load environment files (config.env first so .env can override)
dotenv.config({ path: path.join(__dirname, '..', '..', 'config.env') });
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const fetchImpl = globalThis.fetch
  ? (...args) => globalThis.fetch(...args)
  : (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const BASE_URL = process.env.TEST_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const ADMIN_TOKEN = process.env.TEST_ADMIN_TOKEN || 'demo-token';

const defaultHeaders = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${ADMIN_TOKEN}`
};

const results = [];

const log = (message, extra) => {
  const entry = `${new Date().toISOString()} :: ${message}`;
  console.log(entry);
  if (extra) {
    console.log(extra);
  }
  results.push(entry);
};

async function request(method, endpoint, { body, requireAuth = true } = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = requireAuth ? { ...defaultHeaders } : { 'Content-Type': 'application/json' };

  const options = {
    method,
    headers
  };

  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  const response = await fetchImpl(url, options);
  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const errorMessage = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
    throw new Error(`${method} ${endpoint} failed (${response.status}): ${errorMessage}`);
  }

  return payload;
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tryHealthCheck() {
  try {
    const healthResponse = await request('GET', '/api/health', { requireAuth: false });
    log('Detected running server instance, reusing it', healthResponse);
    return true;
  } catch (error) {
    if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
      return false;
    }
    throw error;
  }
}

async function startServer() {
  log('No running server detected, starting a local instance for the smoke test');

  const serverPath = path.join(__dirname, '..', 'server.js');
  const serverProcess = spawn('node', [serverPath], {
    env: { ...process.env, PORT: process.env.PORT || '3000' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let ready = false;

  const onData = (data) => {
    const text = data.toString();
    process.stdout.write(text);
    if (text.includes('Ready to handle requests') || text.includes('Ready to handle request')) {
      ready = true;
    }
  };

  serverProcess.stdout.on('data', onData);
  serverProcess.stderr.on('data', (data) => process.stderr.write(data.toString()));

  await wait(2000);

  const maxAttempts = 10;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await request('GET', '/api/health', { requireAuth: false });
      ready = true;
      break;
    } catch (error) {
      if (attempt === maxAttempts - 1) {
        serverProcess.kill('SIGINT');
        throw new Error('Server did not become healthy in time');
      }
      await wait(1000);
    }
  }

  if (!ready) {
    serverProcess.kill('SIGINT');
    throw new Error('Failed to start local server');
  }

  return serverProcess;
}

async function stopServer(processHandle) {
  if (!processHandle) return;
  return new Promise((resolve) => {
    processHandle.once('exit', () => resolve());
    processHandle.kill('SIGINT');
    setTimeout(() => {
      if (!processHandle.killed) {
        processHandle.kill('SIGKILL');
      }
    }, 3000);
  });
}

async function run() {
  let serverProcess = null;
  try {
    log(`Running admin smoke test against ${BASE_URL}`);

    const hasServer = await tryHealthCheck();
    serverProcess = hasServer ? null : await startServer();

    // Health check (no auth required)
    const health = await request('GET', '/api/health', { requireAuth: false });
    log('Health check passed', health);

    // Active subscriptions list
    const list = await request('GET', '/api/admin/active-subscriptions?limit=5&page=1');
    const subscriptions = list?.data?.activeSubscriptions || [];
    log(`Fetched ${subscriptions.length} active subscriptions`);

    // Summary endpoint
    const summary = await request('GET', '/api/admin/active-subscriptions/summary');
    log('Summary retrieved', summary.data || summary);

    // Details for first subscription (if any)
    if (subscriptions.length > 0 && subscriptions[0].id) {
      const detail = await request('GET', `/api/admin/active-subscriptions/${subscriptions[0].id}`);
      log(`Detail retrieved for ${subscriptions[0].id}`, detail.data || detail);
    } else {
      log('No active subscriptions available to fetch details; skipping detail test');
    }

    // Export endpoint (JSON format for readability)
    const exported = await request('POST', '/api/admin/active-subscriptions/export', {
      body: { format: 'json' }
    });
    if (Array.isArray(exported)) {
      log(`Export returned ${exported.length} records`);
    } else {
      log('Export endpoint responded', exported);
    }

    log('Admin smoke test completed successfully');

    await stopServer(serverProcess);
    process.exit(0);
  } catch (error) {
    console.error('❌ Admin smoke test failed');
    console.error(error.message);
    await stopServer(serverProcess);
    process.exit(1);
  }
}

run();
