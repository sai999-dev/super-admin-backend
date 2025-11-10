/**
 * Complete Database Verification and Cleanup
 * Checks ALL tables and generates final cleanup SQL
 */

require('dotenv').config({ path: 'config.env' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyAllTables() {
  console.log('========================================');
  console.log('COMPLETE DATABASE VERIFICATION');
  console.log('========================================\n');

  const tables = [
    'agencies',
    'users', 
    'subscription_plans',
    'subscriptions',
    'territories',
    'leads',
    'lead_assignments',
    'lead_purchases',
    'portals',
    'agency_devices',
    'notifications'
  ];

  const allColumns = {};
  
  for (const table of tables) {
    try {
      console.log(`\n📋 Checking ${table.toUpperCase()} table...`);
      
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);

      if (error) {
        console.log(`   ❌ Cannot access: ${error.message}`);
        continue;
      }

      if (data && data[0]) {
        const columns = Object.keys(data[0]);
        allColumns[table] = columns;
        console.log(`   ✅ ${columns.length} columns found`);
        console.log(`   Columns: ${columns.join(', ')}`);
      } else {
        console.log(`   ⚠️  Table empty`);
        allColumns[table] = [];
      }
    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`);
    }
  }

  // Generate final SQL
  console.log('\n\n========================================');
  console.log('GENERATING FINAL CLEANUP SQL');
  console.log('========================================\n');

  let finalSQL = `-- =====================================================
-- FINAL DATABASE CLEANUP AND MAPPING FIX
-- Generated: ${new Date().toISOString()}
-- =====================================================

`;

  // Agencies fixes
  if (allColumns.agencies) {
    finalSQL += `\n-- =====================================================
-- AGENCIES TABLE CLEANUP
-- =====================================================\n`;

    const agencyCols = allColumns.agencies;
    
    // Check what's needed
    const needs = {
      password_hash: !agencyCols.includes('password_hash'),
      territories: !agencyCols.includes('territories'),
      territory_count: !agencyCols.includes('territory_count'),
      territory_limit: !agencyCols.includes('territory_limit'),
      created_at: !agencyCols.includes('created_at') && agencyCols.includes('created_date'),
      has_created_date: agencyCols.includes('created_date')
    };

    if (needs.password_hash) {
      finalSQL += `\n-- Add password_hash for authentication
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS password_hash TEXT;\n`;
    }

    if (needs.created_at) {
      finalSQL += `\n-- Rename created_date to created_at
ALTER TABLE agencies RENAME COLUMN created_date TO created_at;\n`;
    }

    if (needs.territories) {
      finalSQL += `\n-- Add territory management columns
ALTER TABLE agencies 
  ADD COLUMN IF NOT EXISTS territories JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS territory_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS territory_limit INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS preferred_territory_type VARCHAR(20) DEFAULT 'zipcode',
  ADD COLUMN IF NOT EXISTS primary_zipcodes TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS primary_cities TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS primary_counties TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS primary_states TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS territories_updated_at TIMESTAMP;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_agencies_territories_gin ON agencies USING GIN (territories);
CREATE INDEX IF NOT EXISTS idx_agencies_primary_zipcodes ON agencies USING GIN (primary_zipcodes);
CREATE INDEX IF NOT EXISTS idx_agencies_territory_count ON agencies(territory_count);\n`;
    }

    // Columns to check/keep
    console.log('\n   Agency Columns Status:');
    console.log(`   ✅ agency_name: ${agencyCols.includes('agency_name') ? 'EXISTS' : 'MISSING'}`);
    console.log(`   ${agencyCols.includes('business_name') ? '✅' : '⚠️ '} business_name: ${agencyCols.includes('business_name') ? 'EXISTS' : 'MISSING'}`);
    console.log(`   ${agencyCols.includes('password_hash') ? '✅' : '❌'} password_hash: ${agencyCols.includes('password_hash') ? 'EXISTS' : 'MISSING'}`);
    console.log(`   ${agencyCols.includes('created_at') ? '✅' : '❌'} created_at: ${agencyCols.includes('created_at') ? 'EXISTS' : (agencyCols.includes('created_date') ? 'NEEDS RENAME' : 'MISSING')}`);
    console.log(`   ${agencyCols.includes('territories') ? '✅' : '❌'} territories: ${agencyCols.includes('territories') ? 'EXISTS' : 'MISSING'}`);
  }

  // Territories fixes
  if (allColumns.territories) {
    finalSQL += `\n-- =====================================================
-- TERRITORIES TABLE CLEANUP
-- =====================================================\n`;

    const terrCols = allColumns.territories;
    
    const needs = {
      county: !terrCols.includes('county') && terrCols.includes('country'),
      zipcode: !terrCols.includes('zipcode'),
      city: !terrCols.includes('city')
    };

    if (needs.county) {
      finalSQL += `\n-- Rename country to county
ALTER TABLE territories RENAME COLUMN country TO county;\n`;
    }

    if (needs.zipcode || needs.city) {
      finalSQL += `\n-- Add location columns
ALTER TABLE territories 
  ADD COLUMN IF NOT EXISTS zipcode VARCHAR(10),
  ADD COLUMN IF NOT EXISTS city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS county VARCHAR(100);

-- Populate from value field
UPDATE territories SET zipcode = value WHERE type = 'zipcode' AND zipcode IS NULL;
UPDATE territories SET city = value WHERE type = 'city' AND city IS NULL;
UPDATE territories SET county = value WHERE type = 'county' AND county IS NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_territories_zipcode ON territories(zipcode);
CREATE INDEX IF NOT EXISTS idx_territories_city ON territories(city);
CREATE INDEX IF NOT EXISTS idx_territories_county ON territories(county);\n`;
    }

    console.log('\n   Territory Columns Status:');
    console.log(`   ${terrCols.includes('zipcode') ? '✅' : '❌'} zipcode: ${terrCols.includes('zipcode') ? 'EXISTS' : 'MISSING'}`);
    console.log(`   ${terrCols.includes('city') ? '✅' : '❌'} city: ${terrCols.includes('city') ? 'EXISTS' : 'MISSING'}`);
    console.log(`   ${terrCols.includes('county') ? '✅' : '❌'} county: ${terrCols.includes('county') ? 'EXISTS' : (terrCols.includes('country') ? 'NEEDS RENAME' : 'MISSING')}`);
  }

  // Leads verification (should be complete now)
  if (allColumns.leads) {
    console.log('\n   Leads Columns Status:');
    const leadCols = allColumns.leads;
    console.log(`   ${leadCols.includes('first_name') ? '✅' : '❌'} first_name: ${leadCols.includes('first_name') ? 'EXISTS' : 'MISSING'}`);
    console.log(`   ${leadCols.includes('last_name') ? '✅' : '❌'} last_name: ${leadCols.includes('last_name') ? 'EXISTS' : 'MISSING'}`);
    console.log(`   ${leadCols.includes('phone') ? '✅' : '❌'} phone: ${leadCols.includes('phone') ? 'EXISTS' : 'MISSING'}`);
    console.log(`   ${leadCols.includes('address') ? '✅' : '❌'} address: ${leadCols.includes('address') ? 'EXISTS' : 'MISSING'}`);
    console.log(`   ${leadCols.includes('city') ? '✅' : '❌'} city: ${leadCols.includes('city') ? 'EXISTS' : 'MISSING'}`);
    console.log(`   ${leadCols.includes('state') ? '✅' : '❌'} state: ${leadCols.includes('state') ? 'EXISTS' : 'MISSING'}`);
    console.log(`   ${leadCols.includes('zipcode') ? '✅' : '❌'} zipcode: ${leadCols.includes('zipcode') ? 'EXISTS' : 'MISSING'}`);
  }

  // Add migration for territory consolidation
  finalSQL += `\n-- =====================================================
-- MIGRATE TERRITORY DATA TO AGENCIES
-- =====================================================

DO $$
DECLARE
  agency_record RECORD;
  territory_array JSONB;
  total_migrated INTEGER := 0;
BEGIN
  RAISE NOTICE 'Starting territory data migration...';
  
  FOR agency_record IN 
    SELECT DISTINCT agency_id 
    FROM territories 
    WHERE is_active = true
  LOOP
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', id::text,
        'type', type,
        'value', value,
        'state', state,
        'county', COALESCE(county, country),
        'city', city,
        'zipcode', zipcode,
        'is_active', is_active,
        'priority', COALESCE(priority, 0),
        'subscription_id', subscription_id::text,
        'added_at', created_at::text,
        'metadata', COALESCE(metadata, '{}'::jsonb)
      )
    ) INTO territory_array
    FROM territories
    WHERE agency_id = agency_record.agency_id 
      AND is_active = true;
    
    UPDATE agencies
    SET territories = COALESCE(territory_array, '[]'::jsonb)
    WHERE id = agency_record.agency_id;
    
    total_migrated := total_migrated + 1;
  END LOOP;
  
  RAISE NOTICE 'Migrated territories for % agencies', total_migrated;
END $$;
`;

  // Add triggers
  finalSQL += `\n-- =====================================================
-- CREATE AUTO-UPDATE TRIGGERS
-- =====================================================

-- Function to update territory count
CREATE OR REPLACE FUNCTION update_agency_territory_count()
RETURNS TRIGGER AS $$
BEGIN
  NEW.territory_count = jsonb_array_length(COALESCE(NEW.territories, '[]'::jsonb));
  NEW.territories_updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_territory_count ON agencies;
CREATE TRIGGER trigger_update_territory_count
  BEFORE INSERT OR UPDATE OF territories ON agencies
  FOR EACH ROW
  EXECUTE FUNCTION update_agency_territory_count();

-- Function to extract primary territories
CREATE OR REPLACE FUNCTION extract_primary_territories()
RETURNS TRIGGER AS $$
BEGIN
  NEW.primary_zipcodes = ARRAY(
    SELECT DISTINCT value->>'value'
    FROM jsonb_array_elements(COALESCE(NEW.territories, '[]'::jsonb)) AS value
    WHERE value->>'type' = 'zipcode' 
    AND (value->>'is_active')::boolean = true
    AND value->>'deleted_at' IS NULL
  );
  
  NEW.primary_cities = ARRAY(
    SELECT DISTINCT value->>'value'
    FROM jsonb_array_elements(COALESCE(NEW.territories, '[]'::jsonb)) AS value
    WHERE value->>'type' = 'city' 
    AND (value->>'is_active')::boolean = true
    AND value->>'deleted_at' IS NULL
  );
  
  NEW.primary_counties = ARRAY(
    SELECT DISTINCT value->>'value'
    FROM jsonb_array_elements(COALESCE(NEW.territories, '[]'::jsonb)) AS value
    WHERE value->>'type' = 'county' 
    AND (value->>'is_active')::boolean = true
    AND value->>'deleted_at' IS NULL
  );
  
  NEW.primary_states = ARRAY(
    SELECT DISTINCT value->>'value'
    FROM jsonb_array_elements(COALESCE(NEW.territories, '[]'::jsonb)) AS value
    WHERE value->>'type' = 'state' 
    AND (value->>'is_active')::boolean = true
    AND value->>'deleted_at' IS NULL
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_extract_primary_territories ON agencies;
CREATE TRIGGER trigger_extract_primary_territories
  BEFORE INSERT OR UPDATE OF territories ON agencies
  FOR EACH ROW
  EXECUTE FUNCTION extract_primary_territories();
`;

  // Add verification
  finalSQL += `\n-- =====================================================
-- VERIFICATION
-- =====================================================

-- Check agencies columns
SELECT 'agencies' as table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'agencies'
ORDER BY ordinal_position;

-- Check territories columns
SELECT 'territories' as table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'territories'
ORDER BY ordinal_position;

-- Check leads columns
SELECT 'leads' as table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'leads'
ORDER BY ordinal_position;

-- Migration statistics
SELECT 
  COUNT(*) as total_agencies,
  COUNT(*) FILTER (WHERE jsonb_array_length(territories) > 0) as agencies_with_territories,
  SUM(territory_count) as total_territories
FROM agencies;
`;

  // Save to file
  fs.writeFileSync('FINAL_DATABASE_FIX.sql', finalSQL);
  console.log('\n\n✅ Generated: FINAL_DATABASE_FIX.sql');

  // Write column report
  const report = JSON.stringify(allColumns, null, 2);
  fs.writeFileSync('DATABASE_COLUMNS_REPORT.json', report);
  console.log('✅ Generated: DATABASE_COLUMNS_REPORT.json');

  console.log('\n========================================');
  console.log('VERIFICATION COMPLETE');
  console.log('========================================\n');
}

verifyAllTables();
