/**
 * Lead Marketplace Unified Server - CommonJS Version
 * Fixed version with proper error handling
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { performanceMonitor, errorTracker, getHealthData } = require('./middleware/observability');

// Load environment variables from config.env (try multiple locations)
dotenv.config({ path: path.join(__dirname, 'config.env') });
dotenv.config({ path: path.join(__dirname, '..', 'config.env') });
dotenv.config(); // Also try default .env location

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';


app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
});


console.log('🚀 Starting Lead Marketplace Unified Server...');
console.log(`📝 Environment: ${NODE_ENV}`);
console.log(`🔑 JWT Secret loaded: ${process.env.JWT_SECRET ? 'Yes' : 'No'}`);
console.log(`🔐 Demo token enabled: ${NODE_ENV === 'development' ? 'Yes' : 'No'}`);

// =====================================================
// MIDDLEWARE SETUP
// =====================================================

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
          connectSrc: [
            "'self'", 
            "https://json.schemastore.org", 
            "https://api.allorigins.win", 
            "https://cors-anywhere.herokuapp.com",
            "https://api.codetabs.com",
            "https://thingproxy.freeboard.io",
            "https://corsproxy.io",
            "https://cors.bridged.cc",
            "https://dummyjson.com",
            "https://jsonplaceholder.typicode.com",
            "https://httpbin.org",
            "https://api.github.com",
            "https://reqres.in",
            "https://httpstat.us",
            "https://cdn.jsdelivr.net",
            "https://cdn.jsdelivr.net/npm/chart.umd.min.js.map",
            "https://cdn.jsdelivr.net/npm/"
          ],
      fontSrc: ["'self'", "https:", "data:"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    },
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Build allowed origins list from environment variables
    const allowedOrigins = [];
    
    // Add FRONTEND_URL if provided
    if (process.env.FRONTEND_URL) {
      allowedOrigins.push(process.env.FRONTEND_URL);
    }
    
    // Add BASE_URL if provided (and different from FRONTEND_URL)
    if (process.env.BASE_URL && process.env.BASE_URL !== process.env.FRONTEND_URL) {
      allowedOrigins.push(process.env.BASE_URL);
    }
    
    // Add ALLOWED_ORIGINS if provided (comma-separated list)
    if (process.env.ALLOWED_ORIGINS) {
      const origins = process.env.ALLOWED_ORIGINS.split(',').map(url => url.trim());
      allowedOrigins.push(...origins);
    }
    
    // In development, allow localhost on any port (if no FRONTEND_URL is set)
    if (NODE_ENV === 'development' && !process.env.FRONTEND_URL) {
      if (origin.match(/^https?:\/\/localhost(:\d+)?$/)) {
        return callback(null, true);
      }
      if (origin.match(/^https?:\/\/127\.0\.0\.1(:\d+)?$/)) {
        return callback(null, true);
      }
    }
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar'],
  optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
}));

// Handle preflight OPTIONS requests (Express 5.x compatible)
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
    return res.sendStatus(200);
  }
  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compression());

// Logging middleware
if (NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Observability middleware (performance monitoring, error tracking)
app.use(performanceMonitor);

// Trust proxy (for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// =====================================================
// DATABASE CONNECTIONS
// =====================================================

// Supabase connection for Portal Registry
let supabase = null;
try {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  console.log("✅ Supabase connection initialized");
} catch (error) {
  console.error("❌ Supabase connection failed:", error.message);
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

// Helper: generate random API key
function generateApiKey() {
  return "key_" + crypto.randomBytes(16).toString("hex");
}

// Helper: generate slug if not provided
function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .substring(0, 80);
}

// Generate unique portal code
async function generateUniquePortalCode(portalName, supabase) {
  const baseCode = generateSlug(portalName).substring(0, 8).toUpperCase();
  let counter = 1;
  let portalCode = baseCode;
  
  while (true) {
    const { data: existing } = await supabase
      .from("portals")
      .select("portal_code")
      .eq("portal_code", portalCode)
      .limit(1);
    
    if (!existing || existing.length === 0) {
      return portalCode;
    }
    
    portalCode = `${baseCode}${counter.toString().padStart(2, '0')}`;
    counter++;
    
    // Prevent infinite loop
    if (counter > 99) {
      portalCode = `${baseCode}${Date.now().toString().slice(-4)}`;
      break;
    }
  }
  
  return portalCode;
}

// Fetch and count leads from portal API endpoint
async function fetchLeadCountFromAPI(apiEndpoint, authType, authCredentials) {
  try {
    if (!apiEndpoint) {
      console.log('⚠️ No API endpoint provided for lead counting');
      return 0;
    }

    console.log(`🔍 Fetching leads from API endpoint: ${apiEndpoint}`);

    // Prepare headers
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'LeadMarketplace-Admin/1.0'
    };

    // Add authentication headers
    if (authType === 'api_key' && authCredentials) {
      headers['Authorization'] = `Bearer ${authCredentials}`;
      headers['X-API-Key'] = authCredentials;
    } else if (authType === 'basic' && authCredentials) {
      // Basic auth would need to be encoded
      headers['Authorization'] = `Basic ${Buffer.from(authCredentials).toString('base64')}`;
    }

    // Fetch from the API endpoint with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    let response;
    try {
      response = await fetch(apiEndpoint, {
        method: 'GET',
        headers: headers,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.log(`⚠️ Request timeout after 10 seconds`);
        return 0;
      }
      throw fetchError;
    }

    if (!response.ok) {
      console.log(`⚠️ API endpoint returned ${response.status}: ${response.statusText}`);
      return 0;
    }

    const data = await response.json();
    console.log(`✅ Successfully fetched data from API endpoint`);

    // Handle different response formats
    let leadsArray = [];
    
    if (Array.isArray(data)) {
      // If response is directly an array
      leadsArray = data;
    } else if (data.data && Array.isArray(data.data)) {
      // If response is { data: [...] }
      leadsArray = data.data;
    } else if (data.leads && Array.isArray(data.leads)) {
      // If response is { leads: [...] }
      leadsArray = data.leads;
    } else if (data.results && Array.isArray(data.results)) {
      // If response is { results: [...] }
      leadsArray = data.results;
    } else if (data.items && Array.isArray(data.items)) {
      // If response is { items: [...] }
      leadsArray = data.items;
    } else {
      // If it's a single object, count it as 1
      if (data && typeof data === 'object') {
        leadsArray = [data];
      }
    }

    // Count leads and find the largest ID
    let maxId = 0;
    let count = leadsArray.length;

    if (count > 0) {
      // Try to find the largest ID
      leadsArray.forEach(lead => {
        // Check common ID field names
        const idFields = ['id', 'ID', '_id', 'Id', 'lead_id', 'leadId', 'inquiry_id', 'inquiryId'];
        for (const field of idFields) {
          if (lead[field] !== undefined && lead[field] !== null) {
            const idValue = parseInt(lead[field]);
            if (!isNaN(idValue) && idValue > maxId) {
              maxId = idValue;
            }
            break; // Found an ID field, move to next lead
          }
        }
      });

      // If we found a max ID, use that; otherwise use count
      const finalCount = maxId > 0 ? maxId : count;
      console.log(`📊 Found ${count} leads in response, max ID: ${maxId}, using count: ${finalCount}`);
      return finalCount;
    }

    console.log(`📊 No leads found in API response`);
    return 0;

  } catch (error) {
    console.error(`❌ Error fetching leads from API endpoint ${apiEndpoint}:`, error.message);
    return 0; // Return 0 on error to not block portal creation
  }
}

// =====================================================
// API ROUTES
// =====================================================

// Proxy endpoint for external API calls (bypasses CORS)
app.get('/api/proxy', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        message: 'URL parameter is required'
      });
    }

    // Validate URL to prevent SSRF attacks
    let urlObj;
    try {
      urlObj = new URL(url);
    } catch (urlError) {
      return res.status(400).json({
        success: false,
        message: `Invalid URL format: ${urlError.message}`
      });
    }
    
    // Block internal/localhost URLs to prevent SSRF
    if (urlObj.hostname === 'localhost' || 
        urlObj.hostname === '127.0.0.1' || 
        urlObj.hostname === '0.0.0.0' ||
        urlObj.hostname.startsWith('192.168.') ||
        urlObj.hostname.startsWith('10.') ||
        urlObj.hostname.startsWith('172.16.') ||
        urlObj.hostname.endsWith('.local') ||
        urlObj.protocol !== 'https:') {
      return res.status(400).json({
        success: false,
        message: 'Invalid URL. Only HTTPS external URLs are allowed for security reasons.'
      });
    }
    
    console.log(`✅ Proxy request for allowed host: ${urlObj.hostname}`);

    // Get custom headers from query params (for API keys, etc.)
    const headers = {
        'User-Agent': 'LeadMarketplace-Admin/1.0',
        'Accept': 'application/json'
    };

    // Forward Authorization header if provided
    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization;
    }

    // Forward X-API-Key if provided
    if (req.headers['x-api-key']) {
      headers['X-API-Key'] = req.headers['x-api-key'];
    }

    // Forward API key from query param if provided (for compatibility)
    if (req.query.apiKey) {
      headers['Authorization'] = `Bearer ${req.query.apiKey}`;
      headers['X-API-Key'] = req.query.apiKey;
    }

    // Fetch the external resource using built-in fetch (Node.js 18+)
    const response = await fetch(url, {
      headers: headers
    });

    // Get response text first
    const data = await response.text();
    const contentType = response.headers.get('content-type') || '';

    // If the external API returned an error, pass it through with proper status
    if (!response.ok) {
      // Try to parse error message from response
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorData = JSON.parse(data);
        errorMessage = errorData.message || errorData.error || errorMessage;
      } catch (e) {
        // If not JSON, use the text or default message
        if (data && data.length < 500) {
          errorMessage = data;
        }
      }

      return res.status(response.status).json({
        success: false,
        message: errorMessage,
        status: response.status,
        statusText: response.statusText
      });
    }

    // Parse JSON if content type indicates JSON, otherwise return as text
    let parsedData;
    if (contentType.includes('application/json')) {
      try {
        parsedData = JSON.parse(data);
      } catch (e) {
        // If JSON parsing fails, return as text
        parsedData = data;
      }
    } else {
      parsedData = data;
    }
    
    res.json({
      success: true,
      data: parsedData,
      contentType: contentType
    });

  } catch (error) {
    console.error('❌ Proxy error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch external resource'
    });
  }
});

// Health check endpoint (with metrics from observability)
app.get('/api/health', (req, res) => {
  const baseHealth = {
    success: true,
    message: 'Unified Lead Marketplace Server is healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: NODE_ENV,
    services: {
      supabase: supabase ? 'connected' : 'disconnected'
    }
  };
  
  // Merge with observability health check if available
  const observabilityHealth = getHealthData();
  res.status(200).json({ ...baseHealth, ...observabilityHealth });
});

// Metrics endpoint (for monitoring)
app.get('/api/metrics', (req, res) => {
  const { getMetrics } = require('./middleware/observability');
  const metrics = getMetrics();
  res.status(200).json({
    success: true,
    metrics,
    timestamp: new Date().toISOString()
  });
});

// Get database tables endpoint
app.get('/api/database/tables', async (req, res) => {
  try {
    // Validate required environment variables
    if (!process.env.DB_HOST || !process.env.DB_NAME || !process.env.DB_USERNAME || !process.env.DB_PASSWORD) {
      return res.status(500).json({
        success: false,
        message: 'Database configuration missing. Please set DB_HOST, DB_NAME, DB_USERNAME, and DB_PASSWORD environment variables.'
      });
    }

    // Use PostgreSQL client to query information_schema for all tables
    const pgClient = new Client({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME,
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      ssl: {
        rejectUnauthorized: false
      }
    });

    await pgClient.connect();
    
    // Query information_schema to get all user tables (excluding system schemas)
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;
    
    const tablesResult = await pgClient.query(tablesQuery);
    const tableNames = tablesResult.rows.map(row => row.table_name);
    
    await pgClient.end();

    // Now use Supabase to get row counts for each table
    if (!supabase) {
      return res.status(503).json({
        success: false,
        message: 'Supabase connection not available'
      });
    }

    const tablesInfo = [];
    const tablesWithData = [];
    const emptyTables = [];

    // Test each table to get row counts
    for (const tableName of tableNames) {
      try {
        // Attempt to query the table with count
        const { data, error, count } = await supabase
          .from(tableName)
          .select('*', { count: 'exact', head: true })
          .limit(0);

        if (error) {
          // Table might not be accessible via Supabase (some system tables)
          tablesInfo.push({
            table_name: tableName,
            exists: true,
            row_count: null,
            status: 'restricted',
            note: 'Table exists but not accessible via Supabase API'
          });
        } else {
          const rowCount = count || 0;
          const tableInfo = {
            table_name: tableName,
            exists: true,
            row_count: rowCount,
            status: rowCount > 0 ? 'with_data' : 'empty'
          };
          
          tablesInfo.push(tableInfo);
          
          if (rowCount > 0) {
            tablesWithData.push(tableName);
          } else {
            emptyTables.push(tableName);
          }
        }
      } catch (err) {
        // Error accessing table via Supabase
        tablesInfo.push({
          table_name: tableName,
          exists: true,
          row_count: null,
          status: 'restricted',
          error: err.message
        });
      }
    }

    // Sort by table name
    tablesInfo.sort((a, b) => a.table_name.localeCompare(b.table_name));

    return res.status(200).json({
      success: true,
      count: tablesInfo.filter(t => t.exists && t.status !== 'restricted').length,
      total_tables: tableNames.length,
      summary: {
        with_data: tablesWithData.length,
        empty: emptyTables.length,
        restricted: tablesInfo.filter(t => t.status === 'restricted').length
      },
      data: tablesInfo
    });
  } catch (error) {
    console.error('❌ Error fetching database tables:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch database tables'
    });
  }
});

// Create portal_schema_fields table (if not exists)
app.post('/api/database/create-portal-schema-fields-table', async (req, res) => {
  try {
    // Validate required environment variables
    if (!process.env.DB_HOST || !process.env.DB_NAME || !process.env.DB_USERNAME || !process.env.DB_PASSWORD) {
      return res.status(500).json({
        success: false,
        message: 'Database configuration missing. Please set DB_HOST, DB_NAME, DB_USERNAME, and DB_PASSWORD environment variables.'
      });
    }

    const pgClient = new Client({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME,
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      ssl: {
        rejectUnauthorized: false
      }
    });

    await pgClient.connect();
    console.log('✅ PostgreSQL client connected');

    // Create portal_schema_fields table
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS portal_schema_fields (
        id SERIAL PRIMARY KEY,
        portal_id UUID NOT NULL REFERENCES portals(id) ON DELETE CASCADE,
        field_name VARCHAR(255) NOT NULL,
        field_type VARCHAR(100),
        field_description TEXT,
        is_required BOOLEAN DEFAULT FALSE,
        is_primary_key BOOLEAN DEFAULT FALSE,
        default_value TEXT,
        validation_rules JSONB,
        display_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(portal_id, field_name)
      );

      CREATE INDEX IF NOT EXISTS idx_portal_schema_fields_portal_id ON portal_schema_fields(portal_id);
      CREATE INDEX IF NOT EXISTS idx_portal_schema_fields_display_order ON portal_schema_fields(portal_id, display_order);
    `;

    await pgClient.query(createTableSQL);
    console.log('✅ Table portal_schema_fields created successfully');

    await pgClient.end();
    console.log('✅ PostgreSQL client disconnected');

    return res.status(200).json({
      success: true,
      message: '✅ Portal schema fields table created successfully!',
      table_name: 'portal_schema_fields'
    });
  } catch (error) {
    console.error('❌ Error creating portal_schema_fields table:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create table',
      error: error.code || 'UNKNOWN_ERROR'
    });
  }
});

// Create temporary test table endpoint
app.post('/api/database/create-test-table', async (req, res) => {
  try {
    const tableName = req.body.table_name || `test_table_${Date.now()}`;
    
    // Validate required environment variables
    if (!process.env.DB_HOST || !process.env.DB_NAME || !process.env.DB_USERNAME || !process.env.DB_PASSWORD) {
      return res.status(500).json({
        success: false,
        message: 'Database configuration missing. Please set DB_HOST, DB_NAME, DB_USERNAME, and DB_PASSWORD environment variables.'
      });
    }
    
    // Create PostgreSQL client connection
    const pgClient = new Client({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME,
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      ssl: {
        rejectUnauthorized: false // Supabase requires SSL
      }
    });

    await pgClient.connect();
    console.log('✅ PostgreSQL client connected');

    // Create a simple test table
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id SERIAL PRIMARY KEY,
        test_field VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        test_number INTEGER DEFAULT 0
      );
    `;

    await pgClient.query(createTableSQL);
    console.log(`✅ Table '${tableName}' created successfully`);

    // Insert a test row
    const insertSQL = `
      INSERT INTO ${tableName} (test_field, test_number) 
      VALUES ($1, $2) 
      RETURNING *;
    `;
    const insertResult = await pgClient.query(insertSQL, [
      'Test data from temporary table creation',
      Math.floor(Math.random() * 1000)
    ]);

    await pgClient.end();
    console.log('✅ PostgreSQL client disconnected');

    return res.status(200).json({
      success: true,
      message: `✅ Temporary test table '${tableName}' created successfully!`,
      table_name: tableName,
      test_row: insertResult.rows[0],
      note: 'This table will appear in the /api/database/tables endpoint'
    });
  } catch (error) {
    console.error('❌ Error creating test table:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create test table',
      error: error.code || 'UNKNOWN_ERROR'
    });
  }
});

// Delete/Drop table endpoint
app.delete('/api/database/tables/:tableName', async (req, res) => {
  try {
    const tableName = req.params.tableName;
    
    // Safety check: only allow dropping tables that start with 'test_' or 'temp_'
    if (!tableName.startsWith('test_') && !tableName.startsWith('temp_')) {
      return res.status(400).json({
        success: false,
        message: 'For safety, only tables starting with "test_" or "temp_" can be deleted via this endpoint'
      });
    }

    // Validate required environment variables
    if (!process.env.DB_HOST || !process.env.DB_NAME || !process.env.DB_USERNAME || !process.env.DB_PASSWORD) {
      return res.status(500).json({
        success: false,
        message: 'Database configuration missing. Please set DB_HOST, DB_NAME, DB_USERNAME, and DB_PASSWORD environment variables.'
      });
    }

    // Create PostgreSQL client connection
    const pgClient = new Client({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME,
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      ssl: {
        rejectUnauthorized: false
      }
    });

    await pgClient.connect();
    console.log('✅ PostgreSQL client connected');

    // Check if table exists
    const checkTableSQL = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      );
    `;
    const tableExists = await pgClient.query(checkTableSQL, [tableName]);
    
    if (!tableExists.rows[0].exists) {
      await pgClient.end();
      return res.status(404).json({
        success: false,
        message: `Table '${tableName}' does not exist`
      });
    }

    // Drop the table
    const dropTableSQL = `DROP TABLE IF EXISTS ${tableName} CASCADE;`;
    await pgClient.query(dropTableSQL);
    console.log(`✅ Table '${tableName}' dropped successfully`);

    await pgClient.end();
    console.log('✅ PostgreSQL client disconnected');

    return res.status(200).json({
      success: true,
      message: `✅ Table '${tableName}' deleted successfully!`,
      table_name: tableName
    });
  } catch (error) {
    console.error('❌ Error deleting table:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete table',
      error: error.code || 'UNKNOWN_ERROR'
    });
  }
});

// API Documentation endpoint
app.get('/api', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Lead Marketplace API - Portal Registry + Mobile APIs',
    version: '2.0.0',
    endpoints: {
      portals: {
        'POST /api/portals': 'Create new portal',
        'GET /api/portals': 'Get all portals',
        'PUT /api/portals/:id/status': 'Update portal status',
        'DELETE /api/portals/:id': 'Delete portal'
      },
      'Mobile APIs': {
        'POST /api/v1/agencies/register': 'Register new agency',
        'POST /api/v1/agencies/login': 'Login for agency user',
        'GET /api/v1/agencies/profile': 'Get agency profile',
        'GET /api/mobile/subscription/status': 'Get subscription status',
        'GET /api/mobile/subscription/plans': 'Get available plans',
        'GET /api/mobile/territories': 'Get agency territories',
        'POST /api/mobile/territories': 'Add a zipcode territory',
        'DELETE /api/mobile/territories/:zipcode': 'Remove a zipcode territory',
        'POST /api/mobile/territories/request': 'Request territory addition',
        'GET /api/mobile/conversations': 'Get conversations',
        'POST /api/mobile/conversations': 'Start conversation',
        'POST /api/mobile/conversations/:id/messages': 'Send message',
        'GET /api/mobile/message-templates': 'Get message templates'
      }
    }
  });
});

// =====================================================
// PORTAL REGISTRY API (Supabase)
// =====================================================

// Get all portals endpoint
app.get("/api/portals", async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({
        success: false,
        message: "Supabase connection not available"
      });
    }

    // Fetch all portals
    const { data: portals, error: portalsError } = await supabase
      .from("portals")
      .select("*")
      .order("created_at", { ascending: false });

    if (portalsError) throw portalsError;

    if (!portals || portals.length === 0) {
    return res.status(200).json({
      success: true,
        data: [],
        count: 0
      });
    }

    // Get lead counts for each portal
    const portalIds = portals.map(p => p.id);
    const leadCounts = new Map();
    
    // Initialize all portal counts to 0 or use existing total_leads from database
    portals.forEach(portal => {
      leadCounts.set(portal.id, portal.total_leads || 0);
    });
    
    // Fetch fresh counts from API endpoints asynchronously (non-blocking)
    // Return portals immediately with existing counts, update in background
    const portalsWithAPI = portals.filter(p => p.api_endpoint);
    if (portalsWithAPI.length > 0) {
      console.log(`📡 Will fetch lead counts from ${portalsWithAPI.length} portal API endpoints (async, non-blocking)...`);
      
      // Start background process to update lead counts (don't wait)
      (async () => {
        for (const portal of portalsWithAPI) {
          try {
            // Use a shorter timeout (3 seconds) to prevent hanging
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Timeout')), 3000)
            );
            
            const apiCountPromise = fetchLeadCountFromAPI(
              portal.api_endpoint,
              portal.auth_type,
              portal.auth_credentials
            );
            
            const apiCount = await Promise.race([apiCountPromise, timeoutPromise]);
            
            // Update database with new count if valid
            if (apiCount > 0) {
              await supabase
                .from("portals")
                .update({ total_leads: apiCount })
                .eq("id", portal.id);
              
              console.log(`✅ Updated ${portal.portal_name}: ${apiCount} leads`);
            }
          } catch (apiError) {
            // Silently continue - keep existing count
            console.warn(`⚠️ ${portal.portal_name}: ${apiError.message}`);
          }
        }
      })(); // Execute immediately without awaiting
    }
    
    try {
      // Try multiple possible table/column combinations
      const tableOptions = [
        { table: 'leads', column: 'registry_portal_id' },
        { table: 'lead_notifications', column: 'portal_id' },
        { table: 'leads', column: 'portal_id' }
      ];

      // First, let's check what columns exist in the leads table
      try {
        const { data: sampleLead, error: sampleError } = await supabase
          .from('leads')
          .select('*')
          .limit(1);

        if (!sampleError && sampleLead && sampleLead.length > 0) {
          const leadColumns = Object.keys(sampleLead[0]);
          console.log(`📋 Available columns in leads table:`, leadColumns);
          
          // Check which portal column exists
          const portalColumn = leadColumns.find(col => 
            col.includes('portal') || col.includes('Portal')
          );
          
          if (portalColumn) {
            console.log(`✅ Found portal column: ${portalColumn}`);
            
            // Fetch all leads with this portal column
            const { data: allLeads, error: allLeadsError } = await supabase
              .from('leads')
              .select(portalColumn);

            if (!allLeadsError && allLeads) {
              console.log(`📊 Total leads in database: ${allLeads.length}`);
              console.log(`📊 Sample portal IDs in leads:`, allLeads.slice(0, 5).map(l => l[portalColumn]));
              
              // Count leads per portal
              allLeads.forEach(lead => {
                const portalId = lead[portalColumn];
                if (portalId && portalIds.includes(portalId)) {
                  const currentCount = leadCounts.get(portalId) || 0;
                  leadCounts.set(portalId, currentCount + 1);
                }
              });
              
              console.log(`📈 Lead counts calculated:`, Array.from(leadCounts.entries()));
            }
          } else {
            console.log(`⚠️ No portal-related column found in leads table`);
          }
        } else {
          console.log(`📊 Leads table is empty or inaccessible`);
        }
      } catch (checkError) {
        console.log(`⚠️ Could not check leads table structure:`, checkError.message);
      }

      // Also try the original method as fallback
      for (const { table, column } of tableOptions) {
        try {
          console.log(`🔍 Trying to query ${table}.${column} for ${portalIds.length} portals...`);
          
          // Fetch all leads that match any of our portals in a single query
          const { data: leadsData, error: leadsError } = await supabase
            .from(table)
            .select(column)
            .in(column, portalIds);

          if (leadsError) {
            // This table/column combo doesn't work, try next
            console.log(`⚠️ Cannot query ${table}.${column}:`, leadsError.message);
            continue;
          }

          console.log(`📊 Query result: ${leadsData ? leadsData.length : 0} leads found from ${table}.${column}`);

          // Count leads per portal
          if (leadsData && Array.isArray(leadsData) && leadsData.length > 0) {
            leadsData.forEach(lead => {
              const portalId = lead[column];
              if (portalId && portalIds.includes(portalId)) {
                const currentCount = leadCounts.get(portalId) || 0;
                leadCounts.set(portalId, currentCount + 1);
              }
            });
            
            console.log(`📈 Lead counts after ${table}.${column}:`, Array.from(leadCounts.entries()));
            break; // Found data, stop trying other options
          }
        } catch (tableError) {
          // Table doesn't exist or column name is wrong, try next option
          console.log(`⚠️ Table ${table} with column ${column} error:`, tableError.message);
          continue;
        }
      }
      
      console.log(`📊 Final lead counts:`, Array.from(leadCounts.entries()));
    } catch (leadCountError) {
      console.warn("⚠️ Could not fetch lead counts:", leadCountError.message);
      // Continue without lead counts rather than failing
    }

    // Attach lead counts to portals
    const portalsWithCounts = portals.map(portal => ({
      ...portal,
      total_leads: leadCounts.get(portal.id) || 0
    }));

    return res.status(200).json({
      success: true,
      data: portalsWithCounts,
      count: portalsWithCounts.length
    });
  } catch (err) {
    console.error("❌ Error fetching portals:", err);
    res.status(500).json({ 
      success: false, 
      message: err.message || "Internal server error" 
    });
  }
});

// Create portal endpoint (Portal Registry)
app.post("/api/create-portal", async (req, res) => {
  try {
    // Check if Supabase is available
    if (!supabase) {
      return res.status(503).json({
        success: false,
        message: "Database connection not available. Please configure Supabase credentials."
      });
    }

    const body = req.body;

    // Required field validation
    const requiredFields = [
      "portal_name",
      "portal_code",
      "portal_type",
      "industry",
      "api_endpoint",
      "schema_endpoint",
      "auth_type",
      "auth_credentials",
    ];

    for (const field of requiredFields) {
      if (!body[field]) {
        return res
          .status(400)
          .json({ success: false, message: `Missing required field: ${field}` });
      }
    }

    // Generate unique portal code if not provided or if it already exists
    let portalCode = body.portal_code;
    if (!portalCode) {
      portalCode = await generateUniquePortalCode(body.portal_name, supabase);
    } else {
      // Check if the provided portal code already exists
      const { data: existingPortal } = await supabase
        .from("portals")
        .select("portal_code")
        .eq("portal_code", portalCode)
        .limit(1);
      
      if (existingPortal && existingPortal.length > 0) {
        portalCode = await generateUniquePortalCode(body.portal_name, supabase);
      }
    }

    // Generate unique slug to avoid conflicts
    let portalSlug = body.portal_slug || generateSlug(body.portal_name);
    
    // Check if slug exists and generate unique one if needed
    const { data: existingSlug } = await supabase
      .from("portals")
      .select("portal_slug")
      .eq("portal_slug", portalSlug)
      .limit(1);
    
    if (existingSlug && existingSlug.length > 0) {
      const timestamp = Date.now().toString().slice(-8);
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      portalSlug = `${portalSlug}-${timestamp}-${randomSuffix}`;
      console.log("🔄 Generated unique slug:", portalSlug);
    }

    // Generate webhook URL automatically
    const baseUrl = process.env.BASE_URL || process.env.FRONTEND_URL || `http://localhost:${PORT}`;
    const generated_webhook_url = `${baseUrl}/api/webhooks/${portalCode}`;

    // Prepare insert data (only include fields that exist in Supabase schema)
    const portalData = {
      portal_name: body.portal_name,
      portal_code: portalCode,
      portal_slug: portalSlug,
      portal_type: body.portal_type,
      industry: body.industry,
      portal_description: body.portal_description || null,
      base_url: body.base_url || null,
      webhook_url: body.webhook_url || null,
      generated_webhook_url: generated_webhook_url,
      api_endpoint: body.api_endpoint,
      schema_endpoint: body.schema_endpoint,
      auth_type: body.auth_type,
      auth_credentials: body.auth_credentials,
      api_key: generateApiKey(),
      portal_status: "active",
      health_status: "unknown",
      auto_sync_enabled: true,
      sync_frequency: "weekly",
      notification_level: "breaking",
      realtime_delivery_enabled: true,
      delivery_method: "websocket",
      push_notifications: "enabled",
      delivery_timeout: 10,
    };

    // Fetch initial lead count from API endpoint
    try {
      const leadCount = await fetchLeadCountFromAPI(
        body.api_endpoint,
        body.auth_type,
        body.auth_credentials
      );
      portalData.total_leads = leadCount;
      console.log(`📊 Initial lead count from API: ${leadCount}`);
    } catch (leadCountError) {
      console.warn(`⚠️ Could not fetch initial lead count: ${leadCountError.message}`);
      portalData.total_leads = 0; // Default to 0 if fetch fails
    }

    const { data, error } = await supabase.from("portals").insert([portalData]).select();

    if (error) throw error;

    const createdPortal = data && data.length > 0 ? data[0] : null;
    const portalId = createdPortal?.id;

    // Save schema fields if provided
    if (portalId && body.schema_fields && Array.isArray(body.schema_fields) && body.schema_fields.length > 0) {
      try {
        console.log(`💾 Saving ${body.schema_fields.length} schema fields for portal ${portalId}`);
        
        // Prepare schema fields for insertion
        const schemaFieldsData = body.schema_fields.map((field, index) => ({
          portal_id: portalId,
          field_name: field.name || field.field_name || field.key || '',
          field_type: field.type || field.field_type || null,
          field_description: field.description || field.field_description || null,
          is_required: field.required || field.is_required || false,
          is_primary_key: field.primary_key || field.is_primary_key || false,
          default_value: field.default || field.default_value || null,
          validation_rules: field.validation || field.validation_rules || null,
          display_order: field.display_order !== undefined ? field.display_order : index
        }));

        // Validate required environment variables
        if (!process.env.DB_HOST || !process.env.DB_NAME || !process.env.DB_USERNAME || !process.env.DB_PASSWORD) {
          console.error('⚠️ Database configuration missing. Cannot save schema fields.');
          // Continue without saving schema fields
        } else {
          try {
            // Insert schema fields using PostgreSQL client for better control
            const pgClient = new Client({
              host: process.env.DB_HOST,
              port: parseInt(process.env.DB_PORT || '5432'),
              database: process.env.DB_NAME,
              user: process.env.DB_USERNAME,
              password: process.env.DB_PASSWORD,
              ssl: {
                rejectUnauthorized: false
              }
            });

            await pgClient.connect();

            // Insert schema fields in batch
            for (const fieldData of schemaFieldsData) {
              const insertSQL = `
                INSERT INTO portal_schema_fields (
                  portal_id, field_name, field_type, field_description,
                  is_required, is_primary_key, default_value, validation_rules, display_order
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (portal_id, field_name) 
                DO UPDATE SET
                  field_type = EXCLUDED.field_type,
                  field_description = EXCLUDED.field_description,
                  is_required = EXCLUDED.is_required,
                  is_primary_key = EXCLUDED.is_primary_key,
                  default_value = EXCLUDED.default_value,
                  validation_rules = EXCLUDED.validation_rules,
                  display_order = EXCLUDED.display_order,
                  updated_at = CURRENT_TIMESTAMP;
              `;

              await pgClient.query(insertSQL, [
                fieldData.portal_id,
                fieldData.field_name,
                fieldData.field_type,
                fieldData.field_description,
                fieldData.is_required,
                fieldData.is_primary_key,
                fieldData.default_value,
                fieldData.validation_rules ? JSON.stringify(fieldData.validation_rules) : null,
                fieldData.display_order
              ]);
            }

            await pgClient.end();
            console.log(`✅ Successfully saved ${schemaFieldsData.length} schema fields for portal ${portalId}`);
          } catch (schemaFieldsError) {
            console.error('⚠️ Error saving schema fields:', schemaFieldsError);
            // Don't fail portal creation if schema fields save fails
            // Just log the error and continue
          }
        }
      } catch (error) {
        console.error('⚠️ Error in portal creation (schema fields section):', error);
        // Don't fail portal creation if schema fields save fails
        // Just log the error and continue
      }
    }

    return res.status(201).json({
      success: true,
      message: "✅ Portal created successfully!",
      data,
      portal_code: portalCode,
      generated_webhook_url: generated_webhook_url,
    });
  } catch (err) {
    console.error("❌ Error creating portal:", err);
    
    // Handle specific database errors
    if (err.code === '23505') {
      if (err.message.includes('portal_code')) {
        return res.status(400).json({ 
          success: false, 
          message: "Portal code already exists. Please choose a different portal code." 
        });
    } else if (err.message.includes('portal_slug')) {
      // This should not happen anymore since we check proactively
      console.warn("⚠️ Unexpected slug conflict:", err.message);
      return res.status(400).json({ 
        success: false, 
        message: "Slug conflict detected. Please try again." 
      });
    }
    }
    
    res.status(500).json({ 
      success: false, 
      message: err.message || "Internal server error" 
    });
  }
});

// Create portal endpoint (alternative)
app.post("/api/portals", async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({
        success: false,
        message: "Supabase connection not available"
      });
    }

    const body = req.body;

    // Generate unique code, api key, and webhook URL
    const portal_code = body.portal_code || generateSlug(body.portal_name);
    const api_key = generateApiKey();
    const baseUrl = process.env.BASE_URL || process.env.FRONTEND_URL || `http://localhost:${PORT}`;
    const generated_webhook_url = `${baseUrl}/api/webhooks/${portal_code}`;

    const portalData = {
      portal_name: body.portal_name,
      portal_code,
      portal_type: body.portal_type,
      industry: body.industry,
      api_endpoint: body.api_endpoint,
      schema_endpoint: body.schema_endpoint,
      auth_type: body.auth_type,
      auth_credentials: body.auth_credentials,
      api_key,
      generated_webhook_url, // ✅ save it in your new column
      portal_status: "active",
      health_status: "unknown"
    };

    // Optional: fetch initial lead count
    try {
      const leadCount = await fetchLeadCountFromAPI(
        body.api_endpoint,
        body.auth_type,
        body.auth_credentials
      );
      portalData.total_leads = leadCount;
      console.log(`📊 Initial lead count from API: ${leadCount}`);
    } catch (leadCountError) {
      console.warn(`⚠️ Could not fetch initial lead count: ${leadCountError.message}`);
      portalData.total_leads = 0;
    }

    // Save to Supabase
    const { data, error } = await supabase
      .from("portals")
      .insert([portalData])
      .select();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      message: "✅ Portal created successfully!",
      data: data[0],
      generated_webhook_url, // ✅ return it to frontend too
      api_key
    });
  } catch (err) {
    console.error("❌ Error creating portal:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Internal server error"
    });
  }
});




app.post('/api/webhooks/:portal_code', async (req, res) => {
  const { portal_code } = req.params;
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) return res.status(401).json({ success: false, message: 'Missing API key' });

  const { data: portal, error } = await supabase
    .from('portals')
    .select('id')
    .eq('portal_code', portal_code)
    .eq('api_key', apiKey)
    .single();

  if (error || !portal)
    return res.status(403).json({ success: false, message: 'Invalid API key or portal' });

  // Save lead payload
  const { error: insertError } = await supabase
    .from('leads')
    .insert([{ portal_id: portal.id, payload: req.body }]);

  if (insertError)
    return res.status(500).json({ success: false, message: insertError.message });

  res.status(200).json({ success: true, message: 'Lead received successfully' });
});






// Update portal status
app.put("/api/portals/:id/status", async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({
        success: false,
        message: "Supabase connection not available"
      });
    }

    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['active', 'inactive', 'maintenance'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be 'active', 'inactive', or 'maintenance'"
      });
    }

    const { data, error } = await supabase
      .from("portals")
      .update({ portal_status: status })
      .eq("id", id)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Portal not found"
      });
    }

    res.status(200).json({
      success: true,
      message: `Portal status updated to ${status}`,
      data: data[0]
    });
  } catch (err) {
    console.error("❌ Error updating portal status:", err);
    res.status(500).json({ 
      success: false, 
      message: err.message || "Internal server error" 
    });
  }
});

// Delete portal
app.delete("/api/portals/:id", async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({
        success: false,
        message: "Supabase connection not available"
      });
    }

    const { id } = req.params;

    const { data, error } = await supabase
      .from("portals")
      .delete()
      .eq("id", id)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Portal not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Portal deleted successfully",
      data: data[0]
    });
  } catch (err) {
    console.error("❌ Error deleting portal:", err);
    res.status(500).json({ 
      success: false, 
      message: err.message || "Internal server error" 
    });
  }
});

// =====================================================
// LEADS API
// =====================================================

// Get all leads
app.get('/api/admin/leads', async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: {
        leads: [],
        pagination: {
          total: 0,
          page: 1,
          limit: 25,
          totalPages: 0
        }
      }
    });
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch leads',
      error: error.message
    });
  }
});

// Get lead statistics
app.get('/api/admin/leads/stats', async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: {
        totalLeads: 0,
        activeLeads: 0,
        assignedLeads: 0,
        unassignedLeads: 0
      }
    });
  } catch (error) {
    console.error('Error fetching lead stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch lead statistics',
      error: error.message
    });
  }
});

// =====================================================
// STATIC FILE SERVING
// =====================================================

// Check if frontend directory exists
const frontendPath = path.join(__dirname, '..', 'frontend');
const frontendExists = fs.existsSync(frontendPath);

if (frontendExists) {
  // Serve static files from the frontend directory with no-cache headers for development
  app.use(express.static(frontendPath, {
    setHeaders: (res, filePath) => {
      if (NODE_ENV === 'development') {
        // Disable caching in development
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
    ,maxAge: 0, // Disable caching for development
    etag: false
  }));
  console.log('✅ Frontend directory found, static files will be served');
} else {
  console.log('⚠️  Frontend directory not found, serving API only');
}

// =====================================================
// FRONTEND ROUTES
// =====================================================

// Serve index.html for the root route (or API info if frontend doesn't exist)
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, '..', 'frontend', 'index.html');
  if (frontendExists && fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  
  // If no frontend, return API information
  res.status(200).json({
    success: true,
    message: 'Lead Marketplace API Server',
    version: '2.0.0',
    endpoints: {
      health: '/api/health',
      apiDocs: '/api',
      portals: {
        'GET /api/portals': 'Get all portals',
        'POST /api/portals': 'Create new portal',
        'PUT /api/portals/:id/status': 'Update portal status',
        'DELETE /api/portals/:id': 'Delete portal'
      },
      mobile: {
        'POST /api/v1/agencies/register': 'Register new agency',
        'POST /api/v1/agencies/login': 'Login for agency user',
        'GET /api/v1/agencies/profile': 'Get agency profile'
      },
      admin: {
        'All admin routes are under /api/admin/*': 'Requires authentication'
      }
    },
    note: 'Frontend not found. This is an API-only server.'
  });
});

// =====================================================
// MOBILE ROUTES
// =====================================================

// Import mobile auth routes (public - registration/login)
const mobileAuthRoutes = require('./routes/mobileAuthRoutes');

// Import mobile routes
const mobileRoutes = require('./routes/mobileRoutes');
const mobileSubscriptionPurchaseRoutes = require('./routes/mobileSubscriptionPurchaseRoutes');

// Import subscription management routes
const subscriptionManagementRoutes = require('./routes/subscriptionManagementRoutes');

// Import Supabase subscription routes
const supabaseSubscriptionPlansRoutes = require('./routes/supabaseSubscriptionPlansRoutes');
const adminAgencySubscriptionsRoutes = require('./routes/adminAgencySubscriptionsRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');

// Admin routes (re-enabled for Super Admin portal)
const adminRoutes = require('./routes/adminRoutes');
const adminAgenciesRoutes = require('./routes/adminAgenciesRoutes');
const adminUsersRoutes = require('./routes/adminUsersRoutes');
const adminFinancialRoutes = require('./routes/adminFinancialRoutes');
const adminSystemRoutes = require('./routes/adminSystemRoutes');
const adminRolesRoutes = require('./routes/adminRolesRoutes');
const adminEnhancedSubscriptionsRoutes = require('./routes/adminEnhancedSubscriptionsRoutes');
const adminLeadsRoutes = require('./routes/adminLeadsRoutes');

// Apply mobile auth routes (PUBLIC - no authentication required)
app.use('/api/v1/agencies', mobileAuthRoutes);

// Apply mobile routes
app.use('/api/mobile', mobileRoutes);
app.use('/api/mobile', mobileSubscriptionPurchaseRoutes);

// Apply subscription management routes
app.use('/api', subscriptionManagementRoutes);

// Apply Supabase subscription routes (admin)
app.use('/api/admin', supabaseSubscriptionPlansRoutes);
app.use('/api/admin', adminAgencySubscriptionsRoutes);
// Mount enhanced subscriptions BEFORE generic subscription routes to avoid route conflicts
app.use('/api/admin', adminEnhancedSubscriptionsRoutes);
app.use('/api/admin', subscriptionRoutes);

// Apply admin management routes
app.use('/api/admin', adminAgenciesRoutes);
app.use('/api/admin', adminUsersRoutes);
app.use('/api/admin', adminFinancialRoutes);
app.use('/api/admin', adminSystemRoutes);
app.use('/api/admin', adminRolesRoutes);
app.use('/api/admin', adminLeadsRoutes);
app.use('/api/admin', adminRoutes);

// Apply metrics/observability routes
const metricsRoutes = require('./routes/metricsRoutes');
app.use('/api', metricsRoutes);

// 404 handler for API routes (Express 5.x compatible)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      message: 'API endpoint not found',
      path: req.originalUrl,
      method: req.method
    });
  }
  next();
});

// Catch-all handler for client-side routing (SPA) - Express 5.x compatible
app.use((req, res, next) => {
  // Only handle GET requests that aren't API routes
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    const indexPath = path.join(__dirname, '..', 'frontend', 'index.html');
    if (frontendExists && fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
    // If no frontend, return 404 for non-API routes
    return res.status(404).json({
      success: false,
      message: 'Not found. This is an API server. Use /api/* endpoints.',
      path: req.originalUrl,
      availableEndpoints: {
        health: '/api/health',
        apiDocs: '/api',
        portals: '/api/portals'
      }
    });
  }
  next();
});

// =====================================================
// ERROR HANDLING
// =====================================================

// Global error handling middleware
// Global error handler (with observability tracking)
app.use(errorTracker);

// Fallback error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  
  res.status(error.status || 500).json({
    success: false,
    message: error.message || 'Internal server error',
    ...(NODE_ENV === 'development' && { stack: error.stack })
  });
});

// =====================================================
// SERVER STARTUP
// =====================================================

// Start server
async function startServer() {
  try {
    // Start server
    const server = app.listen(PORT, () => {
      console.log('\n🚀 Lead Marketplace Unified Server running!');
      console.log(`🌐 Frontend: http://localhost:${PORT}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
      console.log(`📚 API Documentation: http://localhost:${PORT}/api`);
      console.log(`📊 Supabase: ${supabase ? 'Connected' : 'Disconnected'}`);
      console.log(`✅ Ready to handle requests!`);
      console.log('\n📋 Available Features:');
      console.log('  🏢 Portal Registry (Supabase)');
      console.log('  📊 Lead Management (Supabase)');
      console.log('  💳 Subscription Plans (Supabase)');
      console.log('  🏢 Agency Subscriptions (Supabase)');
      console.log('  📊 Active Subscriptions (Supabase)');
      console.log('  💰 Billing & Payments (Supabase)');
      console.log('\n✨ Unified Admin Portal with Supabase database!');
    });
    
    // Set server timeout
    server.timeout = 30000; // 30 seconds
    
    // Graceful shutdown handlers
    process.on('SIGTERM', () => {
      console.log('\n🛑 SIGTERM received. Shutting down gracefully...');
      server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log('\n🛑 SIGINT received. Shutting down gracefully...');
      server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
      });
    });
    
    return server;
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
if (require.main === module) {
  startServer();
}

module.exports = app;