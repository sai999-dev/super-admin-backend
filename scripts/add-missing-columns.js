/**
 * Add Missing Columns to Database Tables
 * Step-by-step approach for Supabase
 */

require('dotenv').config({ path: 'config.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function addMissingColumns() {
  console.log('========================================');
  console.log('Adding Missing Columns');
  console.log('========================================\n');

  try {
    // Step 1: Check current agencies structure
    console.log('Step 1: Checking agencies table...');
    const { data: agencies, error: agencyError } = await supabase
      .from('agencies')
      .select('*')
      .limit(1);

    if (agencyError) {
      throw new Error(`Cannot access agencies: ${agencyError.message}`);
    }

    if (agencies && agencies[0]) {
      const columns = Object.keys(agencies[0]);
      console.log('Current columns:', columns.join(', '));
      
      const missing = [];
      const requiredColumns = [
        'password_hash',
        'created_at',
        'territories',
        'territory_count',
        'territory_limit',
        'preferred_territory_type',
        'primary_zipcodes',
        'primary_cities',
        'primary_counties',
        'primary_states',
        'territories_updated_at'
      ];
      
      requiredColumns.forEach(col => {
        if (!columns.includes(col)) {
          missing.push(col);
        }
      });
      
      if (missing.length > 0) {
        console.log('\n❌ Missing columns in agencies:');
        missing.forEach(col => console.log(`   - ${col}`));
        console.log('\n📋 Run this SQL in Supabase SQL Editor:');
        console.log('-----------------------------------');
        console.log(`
-- Add missing columns to agencies table
ALTER TABLE agencies 
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS territories JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS territory_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS territory_limit INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS preferred_territory_type VARCHAR(20) DEFAULT 'zipcode',
  ADD COLUMN IF NOT EXISTS primary_zipcodes TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS primary_cities TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS primary_counties TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS primary_states TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS territories_updated_at TIMESTAMP;

-- Rename created_date to created_at if needed
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agencies' AND column_name='created_date') 
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agencies' AND column_name='created_at') THEN
    ALTER TABLE agencies RENAME COLUMN created_date TO created_at;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_agencies_territories_gin ON agencies USING GIN (territories);
CREATE INDEX IF NOT EXISTS idx_agencies_primary_zipcodes ON agencies USING GIN (primary_zipcodes);
CREATE INDEX IF NOT EXISTS idx_agencies_territory_count ON agencies(territory_count);
        `);
        console.log('-----------------------------------\n');
      } else {
        console.log('✅ All required columns exist in agencies table');
      }
    }

    // Step 2: Check territories table
    console.log('\nStep 2: Checking territories table...');
    const { data: territories, error: terrError } = await supabase
      .from('territories')
      .select('*')
      .limit(1);

    if (!terrError && territories && territories[0]) {
      const columns = Object.keys(territories[0]);
      console.log('Current columns:', columns.join(', '));
      
      const missing = [];
      const requiredColumns = ['zipcode', 'city', 'county'];
      
      requiredColumns.forEach(col => {
        if (!columns.includes(col)) {
          missing.push(col);
        }
      });
      
      if (missing.length > 0) {
        console.log('\n❌ Missing columns in territories:');
        missing.forEach(col => console.log(`   - ${col}`));
        console.log('\n📋 Run this SQL in Supabase SQL Editor:');
        console.log('-----------------------------------');
        console.log(`
-- Add missing columns to territories table
ALTER TABLE territories 
  ADD COLUMN IF NOT EXISTS zipcode VARCHAR(10),
  ADD COLUMN IF NOT EXISTS city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS county VARCHAR(100);

-- Rename country to county if needed
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='territories' AND column_name='country') 
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='territories' AND column_name='county') THEN
    ALTER TABLE territories RENAME COLUMN country TO county;
  END IF;
END $$;

-- Populate new columns from existing data
UPDATE territories SET zipcode = value WHERE type = 'zipcode' AND zipcode IS NULL;
UPDATE territories SET city = value WHERE type = 'city' AND city IS NULL;
UPDATE territories SET county = value WHERE type = 'county' AND county IS NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_territories_zipcode ON territories(zipcode);
CREATE INDEX IF NOT EXISTS idx_territories_city ON territories(city);
CREATE INDEX IF NOT EXISTS idx_territories_county ON territories(county);
        `);
        console.log('-----------------------------------\n');
      } else {
        console.log('✅ All required columns exist in territories table');
      }
    }

    // Step 3: Check leads table
    console.log('\nStep 3: Checking leads table...');
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('*')
      .limit(1);

    if (!leadsError && leads && leads[0]) {
      const columns = Object.keys(leads[0]);
      console.log('Current columns:', columns.join(', '));
      
      const missing = [];
      const requiredColumns = ['city', 'state', 'zipcode', 'first_name', 'last_name', 'phone', 'address'];
      
      requiredColumns.forEach(col => {
        if (!columns.includes(col)) {
          missing.push(col);
        }
      });
      
      if (missing.length > 0) {
        console.log('\n❌ Missing columns in leads:');
        missing.forEach(col => console.log(`   - ${col}`));
        console.log('\n📋 Run this SQL in Supabase SQL Editor:');
        console.log('-----------------------------------');
        console.log(`
-- Add missing columns to leads table
ALTER TABLE leads 
  ADD COLUMN IF NOT EXISTS city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS state VARCHAR(2),
  ADD COLUMN IF NOT EXISTS zipcode VARCHAR(10),
  ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS last_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS address TEXT;

-- Extract data from raw_payload if available
UPDATE leads SET 
  city = raw_payload->>'city',
  state = raw_payload->>'state',
  zipcode = raw_payload->>'zipcode'
WHERE raw_payload IS NOT NULL AND city IS NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_leads_city ON leads(city);
CREATE INDEX IF NOT EXISTS idx_leads_state ON leads(state);
CREATE INDEX IF NOT EXISTS idx_leads_zipcode ON leads(zipcode);
        `);
        console.log('-----------------------------------\n');
      } else {
        console.log('✅ All required columns exist in leads table');
      }
    }

    console.log('\n========================================');
    console.log('Column Check Complete');
    console.log('========================================');
    console.log('\n💡 Next Steps:');
    console.log('1. Go to Supabase Dashboard → SQL Editor');
    console.log('2. Copy and paste the SQL statements above');
    console.log('3. Execute them one by one');
    console.log('4. Run this script again to verify\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

addMissingColumns();
