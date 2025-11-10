-- Migration: Add Territory Fields to Agencies Table
-- Date: 2025-11-10
-- Description: Consolidates territory management into agencies table instead of separate territories table

-- =====================================================
-- 1. ADD TERRITORY-RELATED COLUMNS TO AGENCIES
-- =====================================================

-- Add territories as JSONB array to store multiple territories per agency
ALTER TABLE IF EXISTS public.agencies 
ADD COLUMN IF NOT EXISTS territories JSONB DEFAULT '[]';

-- Add territory metadata
ALTER TABLE IF EXISTS public.agencies 
ADD COLUMN IF NOT EXISTS territory_count INTEGER DEFAULT 0;

-- Add territory subscription info (link to subscription plans)
ALTER TABLE IF EXISTS public.agencies 
ADD COLUMN IF NOT EXISTS territory_limit INTEGER DEFAULT 0;

-- Add territory type preference
ALTER TABLE IF EXISTS public.agencies 
ADD COLUMN IF NOT EXISTS preferred_territory_type VARCHAR(20) DEFAULT 'zipcode' 
CHECK (preferred_territory_type IN ('zipcode', 'city', 'county', 'state'));

-- Add primary territories (quick access to main territories)
ALTER TABLE IF EXISTS public.agencies 
ADD COLUMN IF NOT EXISTS primary_zipcodes TEXT[] DEFAULT '{}';

ALTER TABLE IF EXISTS public.agencies 
ADD COLUMN IF NOT EXISTS primary_cities TEXT[] DEFAULT '{}';

ALTER TABLE IF EXISTS public.agencies 
ADD COLUMN IF NOT EXISTS primary_counties TEXT[] DEFAULT '{}';

ALTER TABLE IF EXISTS public.agencies 
ADD COLUMN IF NOT EXISTS primary_states TEXT[] DEFAULT '{}';

-- Add territory management dates
ALTER TABLE IF EXISTS public.agencies 
ADD COLUMN IF NOT EXISTS territories_updated_at TIMESTAMP DEFAULT NOW();

-- =====================================================
-- 2. CREATE INDEXES FOR TERRITORY SEARCHES
-- =====================================================

-- GIN index for JSONB territories column (enables fast lookups)
CREATE INDEX IF NOT EXISTS idx_agencies_territories_gin 
ON agencies USING GIN (territories);

-- Index for array searches
CREATE INDEX IF NOT EXISTS idx_agencies_primary_zipcodes 
ON agencies USING GIN (primary_zipcodes);

CREATE INDEX IF NOT EXISTS idx_agencies_primary_cities 
ON agencies USING GIN (primary_cities);

CREATE INDEX IF NOT EXISTS idx_agencies_primary_counties 
ON agencies USING GIN (primary_counties);

CREATE INDEX IF NOT EXISTS idx_agencies_primary_states 
ON agencies USING GIN (primary_states);

-- Index for territory count
CREATE INDEX IF NOT EXISTS idx_agencies_territory_count 
ON agencies(territory_count);

-- =====================================================
-- 3. ADD HELPER FUNCTIONS
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

-- Trigger to auto-update territory count
DROP TRIGGER IF EXISTS trigger_update_territory_count ON agencies;
CREATE TRIGGER trigger_update_territory_count
  BEFORE INSERT OR UPDATE OF territories ON agencies
  FOR EACH ROW
  EXECUTE FUNCTION update_agency_territory_count();

-- Function to extract primary territories from JSONB
CREATE OR REPLACE FUNCTION extract_primary_territories()
RETURNS TRIGGER AS $$
BEGIN
  -- Extract zipcodes
  NEW.primary_zipcodes = ARRAY(
    SELECT DISTINCT value->>'value'
    FROM jsonb_array_elements(COALESCE(NEW.territories, '[]'::jsonb)) AS value
    WHERE value->>'type' = 'zipcode' AND (value->>'is_active')::boolean = true
  );
  
  -- Extract cities
  NEW.primary_cities = ARRAY(
    SELECT DISTINCT value->>'value'
    FROM jsonb_array_elements(COALESCE(NEW.territories, '[]'::jsonb)) AS value
    WHERE value->>'type' = 'city' AND (value->>'is_active')::boolean = true
  );
  
  -- Extract counties
  NEW.primary_counties = ARRAY(
    SELECT DISTINCT value->>'value'
    FROM jsonb_array_elements(COALESCE(NEW.territories, '[]'::jsonb)) AS value
    WHERE value->>'type' = 'county' AND (value->>'is_active')::boolean = true
  );
  
  -- Extract states
  NEW.primary_states = ARRAY(
    SELECT DISTINCT value->>'value'
    FROM jsonb_array_elements(COALESCE(NEW.territories, '[]'::jsonb)) AS value
    WHERE value->>'type' = 'state' AND (value->>'is_active')::boolean = true
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-extract primary territories
DROP TRIGGER IF EXISTS trigger_extract_primary_territories ON agencies;
CREATE TRIGGER trigger_extract_primary_territories
  BEFORE INSERT OR UPDATE OF territories ON agencies
  FOR EACH ROW
  EXECUTE FUNCTION extract_primary_territories();

-- =====================================================
-- 4. MIGRATE DATA FROM TERRITORIES TABLE TO AGENCIES
-- =====================================================

-- Create temporary function to migrate territories
CREATE OR REPLACE FUNCTION migrate_territories_to_agencies()
RETURNS void AS $$
DECLARE
  agency_record RECORD;
  territory_array JSONB;
BEGIN
  -- Loop through each agency
  FOR agency_record IN SELECT DISTINCT agency_id FROM territories WHERE deleted_at IS NULL
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
        'added_at', created_at,
        'metadata', COALESCE(metadata, '{}'::jsonb)
      )
    ) INTO territory_array
    FROM territories
    WHERE agency_id = agency_record.agency_id 
      AND deleted_at IS NULL;
    
    -- Update agency with territories
    UPDATE agencies
    SET territories = COALESCE(territory_array, '[]'::jsonb)
    WHERE id = agency_record.agency_id;
    
    RAISE NOTICE 'Migrated territories for agency %', agency_record.agency_id;
  END LOOP;
  
  RAISE NOTICE 'Territory migration completed';
END;
$$ LANGUAGE plpgsql;

-- Execute migration (comment out after first run)
SELECT migrate_territories_to_agencies();

-- =====================================================
-- 5. ADD COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON COLUMN agencies.territories IS 'JSONB array storing all territories owned by agency. Each element: {id, type, value, state, county, city, zipcode, is_active, priority, subscription_id, added_at, metadata}';
COMMENT ON COLUMN agencies.territory_count IS 'Auto-calculated count of active territories';
COMMENT ON COLUMN agencies.territory_limit IS 'Maximum territories allowed based on subscription plan';
COMMENT ON COLUMN agencies.primary_zipcodes IS 'Array of active zipcode values for fast lookup';
COMMENT ON COLUMN agencies.primary_cities IS 'Array of active city values for fast lookup';
COMMENT ON COLUMN agencies.primary_counties IS 'Array of active county values for fast lookup';
COMMENT ON COLUMN agencies.primary_states IS 'Array of active state values for fast lookup';

-- =====================================================
-- 6. CREATE VIEW FOR BACKWARD COMPATIBILITY (OPTIONAL)
-- =====================================================

-- Create a view that mimics the old territories table structure
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
WHERE territory->>'is_active' = 'true';

COMMENT ON VIEW territories_view IS 'Backward compatibility view - presents agencies.territories JSONB as relational table';

-- =====================================================
-- 7. VERIFICATION QUERIES
-- =====================================================

-- Verify migration
DO $$
DECLARE
  agency_count INTEGER;
  territory_count INTEGER;
  migrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO agency_count FROM agencies;
  SELECT COUNT(*) INTO territory_count FROM territories WHERE deleted_at IS NULL;
  SELECT COUNT(*) INTO migrated_count FROM agencies WHERE jsonb_array_length(territories) > 0;
  
  RAISE NOTICE 'Total agencies: %', agency_count;
  RAISE NOTICE 'Total active territories in old table: %', territory_count;
  RAISE NOTICE 'Agencies with migrated territories: %', migrated_count;
  
  IF migrated_count > 0 THEN
    RAISE NOTICE '✅ Migration successful!';
  ELSE
    RAISE NOTICE '⚠️ No territories migrated. Check if territories table has data.';
  END IF;
END $$;

-- =====================================================
-- 8. OPTIONAL: RENAME OLD TERRITORIES TABLE
-- =====================================================

-- Uncomment to rename old table (backup)
-- ALTER TABLE IF EXISTS territories RENAME TO territories_backup_20251110;

-- Final completion message
DO $$
BEGIN
  RAISE NOTICE '✅ Territory consolidation migration completed!';
END $$;
