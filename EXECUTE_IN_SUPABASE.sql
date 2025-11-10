-- =====================================================
-- DATABASE SCHEMA FIXES AND TERRITORY CONSOLIDATION
-- Execute this in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- 1. ADD MISSING COLUMNS TO AGENCIES TABLE
-- =====================================================

-- Add password_hash column
ALTER TABLE agencies 
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Rename created_date to created_at
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agencies' AND column_name='created_date') 
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agencies' AND column_name='created_at') THEN
    ALTER TABLE agencies RENAME COLUMN created_date TO created_at;
  END IF;
END $$;

-- Add territory management columns
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

-- Create indexes for agencies
CREATE INDEX IF NOT EXISTS idx_agencies_territories_gin ON agencies USING GIN (territories);
CREATE INDEX IF NOT EXISTS idx_agencies_primary_zipcodes ON agencies USING GIN (primary_zipcodes);
CREATE INDEX IF NOT EXISTS idx_agencies_territory_count ON agencies(territory_count);

-- =====================================================
-- 2. ADD MISSING COLUMNS TO TERRITORIES TABLE
-- =====================================================

-- Add zipcode, city, county columns
ALTER TABLE territories 
  ADD COLUMN IF NOT EXISTS zipcode VARCHAR(10),
  ADD COLUMN IF NOT EXISTS city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS county VARCHAR(100);

-- Rename country to county if exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='territories' AND column_name='country') 
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='territories' AND column_name='county') THEN
    ALTER TABLE territories RENAME COLUMN country TO county;
  END IF;
END $$;

-- Populate new columns from existing value field
UPDATE territories SET zipcode = value WHERE type = 'zipcode' AND zipcode IS NULL;
UPDATE territories SET city = value WHERE type = 'city' AND city IS NULL;
UPDATE territories SET county = value WHERE type = 'county' AND county IS NULL;

-- Create indexes for territories
CREATE INDEX IF NOT EXISTS idx_territories_zipcode ON territories(zipcode);
CREATE INDEX IF NOT EXISTS idx_territories_city ON territories(city);
CREATE INDEX IF NOT EXISTS idx_territories_county ON territories(county);

-- =====================================================
-- 3. ADD MISSING COLUMNS TO LEADS TABLE
-- =====================================================

-- Add city, state, zipcode columns
ALTER TABLE leads 
  ADD COLUMN IF NOT EXISTS city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS state VARCHAR(2),
  ADD COLUMN IF NOT EXISTS zipcode VARCHAR(10);

-- Extract data from raw_payload if available
UPDATE leads SET 
  city = raw_payload->>'city',
  state = raw_payload->>'state',
  zipcode = raw_payload->>'zipcode'
WHERE raw_payload IS NOT NULL AND city IS NULL;

-- Create indexes for leads
CREATE INDEX IF NOT EXISTS idx_leads_city ON leads(city);
CREATE INDEX IF NOT EXISTS idx_leads_state ON leads(state);
CREATE INDEX IF NOT EXISTS idx_leads_zipcode ON leads(zipcode);

-- =====================================================
-- 4. CREATE TRIGGER FUNCTIONS
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

-- Drop if exists and create trigger
DROP TRIGGER IF EXISTS trigger_update_territory_count ON agencies;
CREATE TRIGGER trigger_update_territory_count
  BEFORE INSERT OR UPDATE OF territories ON agencies
  FOR EACH ROW
  EXECUTE FUNCTION update_agency_territory_count();

-- Function to extract primary territories
CREATE OR REPLACE FUNCTION extract_primary_territories()
RETURNS TRIGGER AS $$
BEGIN
  -- Extract zipcodes
  NEW.primary_zipcodes = ARRAY(
    SELECT DISTINCT value->>'value'
    FROM jsonb_array_elements(COALESCE(NEW.territories, '[]'::jsonb)) AS value
    WHERE value->>'type' = 'zipcode' 
    AND (value->>'is_active')::boolean = true
    AND value->>'deleted_at' IS NULL
  );
  
  -- Extract cities
  NEW.primary_cities = ARRAY(
    SELECT DISTINCT value->>'value'
    FROM jsonb_array_elements(COALESCE(NEW.territories, '[]'::jsonb)) AS value
    WHERE value->>'type' = 'city' 
    AND (value->>'is_active')::boolean = true
    AND value->>'deleted_at' IS NULL
  );
  
  -- Extract counties
  NEW.primary_counties = ARRAY(
    SELECT DISTINCT value->>'value'
    FROM jsonb_array_elements(COALESCE(NEW.territories, '[]'::jsonb)) AS value
    WHERE value->>'type' = 'county' 
    AND (value->>'is_active')::boolean = true
    AND value->>'deleted_at' IS NULL
  );
  
  -- Extract states
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

-- Drop if exists and create trigger
DROP TRIGGER IF EXISTS trigger_extract_primary_territories ON agencies;
CREATE TRIGGER trigger_extract_primary_territories
  BEFORE INSERT OR UPDATE OF territories ON agencies
  FOR EACH ROW
  EXECUTE FUNCTION extract_primary_territories();

-- =====================================================
-- 5. MIGRATE EXISTING TERRITORY DATA
-- =====================================================

DO $$
DECLARE
  agency_record RECORD;
  territory_array JSONB;
  total_migrated INTEGER := 0;
BEGIN
  RAISE NOTICE 'Starting territory data migration...';
  
  -- Loop through each agency that has territories
  FOR agency_record IN 
    SELECT DISTINCT agency_id 
    FROM territories 
    WHERE is_active = true
  LOOP
    -- Build JSONB array of territories for this agency
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', id::text,
        'type', type,
        'value', value,
        'state', state,
        'county', county,
        'city', city,
        'zipcode', zipcode,
        'is_active', is_active,
        'priority', priority,
        'subscription_id', subscription_id::text,
        'added_at', created_at::text,
        'metadata', COALESCE(metadata, '{}'::jsonb)
      )
    ) INTO territory_array
    FROM territories
    WHERE agency_id = agency_record.agency_id 
      AND is_active = true;
    
    -- Update agency with territories
    UPDATE agencies
    SET territories = COALESCE(territory_array, '[]'::jsonb)
    WHERE id = agency_record.agency_id;
    
    total_migrated := total_migrated + 1;
  END LOOP;
  
  RAISE NOTICE 'Migrated territories for % agencies', total_migrated;
END $$;

-- =====================================================
-- 6. CREATE BACKWARD COMPATIBILITY VIEW
-- =====================================================

CREATE OR REPLACE VIEW territories_view AS
SELECT 
  (territory->>'id')::uuid AS id,
  a.id AS agency_id,
  (territory->>'subscription_id')::uuid AS subscription_id,
  territory->>'type' AS type,
  territory->>'value' AS value,
  territory->>'state' AS state,
  territory->>'county' AS county,
  territory->>'city' AS city,
  territory->>'zipcode' AS zipcode,
  (territory->>'is_active')::boolean AS is_active,
  (territory->>'priority')::integer AS priority,
  (territory->>'added_at')::timestamp AS created_at,
  a.territories_updated_at AS updated_at,
  territory->'metadata' AS metadata
FROM agencies a,
LATERAL jsonb_array_elements(a.territories) AS territory
WHERE (territory->>'is_active')::boolean = true
  AND territory->>'deleted_at' IS NULL;

-- =====================================================
-- 7. VERIFICATION QUERIES
-- =====================================================

-- Check agencies columns
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_name = 'agencies'
ORDER BY ordinal_position;

-- Check territories columns
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_name = 'territories'
ORDER BY ordinal_position;

-- Check leads columns
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_name = 'leads'
ORDER BY ordinal_position;

-- =====================================================
-- 8. MIGRATION STATISTICS
-- =====================================================

DO $$
DECLARE
  agency_count INTEGER;
  territory_count INTEGER;
  migrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO agency_count FROM agencies;
  SELECT COUNT(*) INTO territory_count FROM territories WHERE is_active = true;
  SELECT COUNT(*) INTO migrated_count FROM agencies WHERE jsonb_array_length(territories) > 0;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'MIGRATION COMPLETE';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Total agencies: %', agency_count;
  RAISE NOTICE 'Total active territories: %', territory_count;
  RAISE NOTICE 'Agencies with migrated territories: %', migrated_count;
  RAISE NOTICE '========================================';
END $$;
