const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from config.env (same location as server.js expects)
dotenv.config({ path: path.join(__dirname, '..', 'config.env') });
// Also try default .env location
dotenv.config();

// Use Supabase connection directly from environment variables
// Extract database connection details from Supabase URL if needed
// Otherwise use direct database connection variables from environment

const config = {
  development: {
    username: process.env.DB_USER || process.env.SUPABASE_DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || process.env.SUPABASE_DB_PASSWORD,
    database: process.env.DB_NAME || process.env.SUPABASE_DB_NAME || 'postgres',
    host: process.env.DB_HOST || process.env.SUPABASE_DB_HOST || (process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).hostname.replace('.supabase.co', '.pooler.supabase.com') : undefined),
    port: parseInt(process.env.DB_PORT || process.env.SUPABASE_DB_PORT || '5432'),
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    }
  },
  
  production: {
    username: process.env.DB_USER || process.env.SUPABASE_DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || process.env.SUPABASE_DB_PASSWORD,
    database: process.env.DB_NAME || process.env.SUPABASE_DB_NAME || 'postgres',
    host: process.env.DB_HOST || process.env.SUPABASE_DB_HOST || (process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).hostname.replace('.supabase.co', '.pooler.supabase.com') : undefined),
    port: parseInt(process.env.DB_PORT || process.env.SUPABASE_DB_PORT || '5432'),
    dialect: 'postgres',
    logging: false,
    pool: {
      max: 20,
      min: 5,
      acquire: 30000,
      idle: 10000
    },
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    }
  },
  
  test: {
    username: process.env.DB_USER || process.env.SUPABASE_DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || process.env.SUPABASE_DB_PASSWORD,
    database: process.env.DB_NAME || process.env.SUPABASE_DB_NAME || 'leadmarketplace_test',
    host: process.env.DB_HOST || process.env.SUPABASE_DB_HOST || (process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).hostname.replace('.supabase.co', '.pooler.supabase.com') : undefined),
    port: parseInt(process.env.DB_PORT || process.env.SUPABASE_DB_PORT || '5432'),
    dialect: 'postgres',
    logging: false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    }
  }
};

module.exports = config;
