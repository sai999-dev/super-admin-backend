const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from config.env (same location as server.js expects)
dotenv.config({ path: path.join(__dirname, '..', 'config.env') });
// Also try default .env location
dotenv.config();

// Require environment configuration - no fallbacks
const supabaseUrl = process.env.SUPABASE_URL_LIVE || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY
  || process.env.SERVICE_KEY
  || process.env.SUPABASE_SERVICE_ROLE_KEY_LIVE 
  || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing required environment variables: SUPABASE_URL (or SUPABASE_URL_LIVE) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE_KEY_LIVE) must be set');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

module.exports = supabase;
