-- Fix Migration: Add Territory Fields to Agencies Table
-- Date: 2025-11-10
-- Description: Properly adds territory management fields to agencies table

-- =====================================================
-- 1. ADD MISSING COLUMNS TO AGENCIES
-- =====================================================

-- Add password_hash if missing (for authentication)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='agencies' AND column_name='password_hash'
    ) THEN
        ALTER TABLE agencies ADD COLUMN password_hash TEXT;
        RAISE NOTICE 'Added password_hash column';
    END IF;
END $$;

-- Fix created_at (currently named created_date)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='agencies' AND column_name='created_at'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name='agencies' AND column_name='created_date'
        ) THEN
            ALTER TABLE agencies RENAME COLUMN created_date TO created_at;
            RAISE NOTICE 'Renamed created_date to created_at';
        ELSE
            ALTER TABLE agencies ADD COLUMN created_at TIMESTAMP DEFAULT NOW();
            RAISE NOTICE 'Added created_at column';
        END IF;
    END IF;
END $$;

-- =====================================================
-- 2. ADD TERRITORY-RELATED COLUMNS TO AGENCIES
-- =====================================================

-- Add territories JSONB array
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='agencies' AND column_name='territories'
    ) THEN
        ALTER TABLE agencies ADD COLUMN territories JSONB DEFAULT '[]'::jsonb;
        RAISE NOTICE 'Added territories column';
    END IF;
END $$;

-- Add territory_count
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='agencies' AND column_name='territory_count'
    ) THEN
        ALTER TABLE agencies ADD COLUMN territory_count INTEGER DEFAULT 0;
        RAISE NOTICE 'Added territory_count column';
    END IF;
END $$;

-- Add territory_limit
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='agencies' AND column_name='territory_limit'
    ) THEN
        ALTER TABLE agencies ADD COLUMN territory_limit INTEGER DEFAULT 0;
        RAISE NOTICE 'Added territory_limit column';
    END IF;
END $$;

-- Add preferred_territory_type
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='agencies' AND column_name='preferred_territory_type'
    ) THEN
        ALTER TABLE agencies ADD COLUMN preferred_territory_type VARCHAR(20) DEFAULT 'zipcode';
        RAISE NOTICE 'Added preferred_territory_type column';
    END IF;
END $$;

-- Add primary territory arrays
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='agencies' AND column_name='primary_zipcodes'
    ) THEN
        ALTER TABLE agencies ADD COLUMN primary_zipcodes TEXT[] DEFAULT '{}';
        RAISE NOTICE 'Added primary_zipcodes column';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='agencies' AND column_name='primary_cities'
    ) THEN
        ALTER TABLE agencies ADD COLUMN primary_cities TEXT[] DEFAULT '{}';
        RAISE NOTICE 'Added primary_cities column';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='agencies' AND column_name='primary_counties'
    ) THEN
        ALTER TABLE agencies ADD COLUMN primary_counties TEXT[] DEFAULT '{}';
        RAISE NOTICE 'Added primary_counties column';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='agencies' AND column_name='primary_states'
    ) THEN
        ALTER TABLE agencies ADD COLUMN primary_states TEXT[] DEFAULT '{}';
        RAISE NOTICE 'Added primary_states column';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='agencies' AND column_name='territories_updated_at'
    ) THEN
        ALTER TABLE agencies ADD COLUMN territories_updated_at TIMESTAMP;
        RAISE NOTICE 'Added territories_updated_at column';
    END IF;
END $$;

-- =====================================================
-- 3. ADD MISSING COLUMNS TO TERRITORIES TABLE
-- =====================================================

-- Add zipcode column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='territories' AND column_name='zipcode'
    ) THEN
        ALTER TABLE territories ADD COLUMN zipcode VARCHAR(10);
        -- Populate from value where type='zipcode'
        UPDATE territories SET zipcode = value WHERE type = 'zipcode';
        RAISE NOTICE 'Added zipcode column';
    END IF;
END $$;

-- Add city column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='territories' AND column_name='city'
    ) THEN
        ALTER TABLE territories ADD COLUMN city VARCHAR(100);
        -- Populate from value where type='city'
        UPDATE territories SET city = value WHERE type = 'city';
        RAISE NOTICE 'Added city column';
    END IF;
END $$;

-- Add county column (rename country to county if needed)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='territories' AND column_name='county'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name='territories' AND column_name='country'
        ) THEN
            ALTER TABLE territories RENAME COLUMN country TO county;
            RAISE NOTICE 'Renamed country to county';
        ELSE
            ALTER TABLE territories ADD COLUMN county VARCHAR(100);
            -- Populate from value where type='county'
            UPDATE territories SET county = value WHERE type = 'county';
            RAISE NOTICE 'Added county column';
        END IF;
    END IF;
END $$;

-- =====================================================
-- 4. ADD MISSING COLUMNS TO LEADS TABLE
-- =====================================================

-- Add city, state, zipcode by extracting from raw_payload
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='leads' AND column_name='city'
    ) THEN
        ALTER TABLE leads ADD COLUMN city VARCHAR(100);
        -- Extract from raw_payload
        UPDATE leads SET city = raw_payload->>'city' WHERE raw_payload IS NOT NULL;
        RAISE NOTICE 'Added city column';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='leads' AND column_name='state'
    ) THEN
        ALTER TABLE leads ADD COLUMN state VARCHAR(2);
        -- Extract from raw_payload
        UPDATE leads SET state = raw_payload->>'state' WHERE raw_payload IS NOT NULL;
        RAISE NOTICE 'Added state column';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='leads' AND column_name='zipcode'
    ) THEN
        ALTER TABLE leads ADD COLUMN zipcode VARCHAR(10);
        -- Extract from raw_payload
        UPDATE leads SET zipcode = raw_payload->>'zipcode' WHERE raw_payload IS NOT NULL;
        RAISE NOTICE 'Added zipcode column';
    END IF;
END $$;

-- =====================================================
-- 5. CREATE INDEXES
-- =====================================================

-- GIN index for JSONB territories column
CREATE INDEX IF NOT EXISTS idx_agencies_territories_gin 
ON agencies USING GIN (territories);

-- Index for array searches
CREATE INDEX IF NOT EXISTS idx_agencies_primary_zipcodes 
ON agencies USING GIN (primary_zipcodes);

CREATE INDEX IF NOT EXISTS idx_agencies_territory_count 
ON agencies(territory_count);

-- Indexes for territories table
CREATE INDEX IF NOT EXISTS idx_territories_zipcode ON territories(zipcode);
CREATE INDEX IF NOT EXISTS idx_territories_city ON territories(city);
CREATE INDEX IF NOT EXISTS idx_territories_county ON territories(county);

-- Indexes for leads table
CREATE INDEX IF NOT EXISTS idx_leads_city ON leads(city);
CREATE INDEX IF NOT EXISTS idx_leads_state ON leads(state);
CREATE INDEX IF NOT EXISTS idx_leads_zipcode ON leads(zipcode);

-- =====================================================
-- 6. CREATE TRIGGERS
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
-- 7. MIGRATE EXISTING TERRITORY DATA
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
        'county', COALESCE(county, country),
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
-- 8. CREATE BACKWARD COMPATIBILITY VIEW
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
-- 9. VERIFICATION
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
