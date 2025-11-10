-- =====================================================
-- FINAL DATABASE CLEANUP AND MAPPING FIX
-- Generated: 2025-11-10T16:58:42.776Z
-- =====================================================


-- =====================================================
-- AGENCIES TABLE CLEANUP
-- =====================================================

-- =====================================================
-- TERRITORIES TABLE CLEANUP
-- =====================================================

-- =====================================================
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

-- =====================================================
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

-- =====================================================
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
