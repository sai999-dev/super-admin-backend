-- =====================================================
-- FIX ZIPCODES SYNCHRONIZATION
-- This script ensures zipcodes column stays in sync with primary_zipcodes
-- Execute this in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- 1. CREATE TRIGGER TO SYNC ZIPCODES WITH PRIMARY_ZIPCODES
-- =====================================================

-- Function to sync zipcodes column with primary_zipcodes array
CREATE OR REPLACE FUNCTION sync_zipcodes_column()
RETURNS TRIGGER AS $$
BEGIN
  -- Copy primary_zipcodes to zipcodes column for backward compatibility
  NEW.zipcodes = NEW.primary_zipcodes;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop if exists and create trigger
DROP TRIGGER IF EXISTS trigger_sync_zipcodes ON agencies;
CREATE TRIGGER trigger_sync_zipcodes
  BEFORE INSERT OR UPDATE OF primary_zipcodes, territories ON agencies
  FOR EACH ROW
  EXECUTE FUNCTION sync_zipcodes_column();

-- =====================================================
-- 2. SYNC EXISTING DATA
-- =====================================================

-- Update all agencies to sync zipcodes with primary_zipcodes
UPDATE agencies
SET zipcodes = primary_zipcodes
WHERE primary_zipcodes IS NOT NULL 
  AND (zipcodes IS NULL OR zipcodes <> primary_zipcodes);

-- =====================================================
-- 3. VERIFICATION
-- =====================================================

-- Check zipcodes sync status
SELECT 
  id,
  agency_name,
  business_name,
  zipcodes,
  primary_zipcodes,
  CASE 
    WHEN zipcodes = primary_zipcodes THEN 'SYNCED'
    WHEN zipcodes IS NULL AND primary_zipcodes IS NULL THEN 'EMPTY'
    ELSE 'OUT_OF_SYNC'
  END AS sync_status
FROM agencies
ORDER BY sync_status DESC, created_at DESC
LIMIT 20;

-- Count sync status
SELECT 
  CASE 
    WHEN zipcodes = primary_zipcodes THEN 'SYNCED'
    WHEN zipcodes IS NULL AND primary_zipcodes IS NULL THEN 'EMPTY'
    ELSE 'OUT_OF_SYNC'
  END AS sync_status,
  COUNT(*) as count
FROM agencies
GROUP BY sync_status;

-- =====================================================
-- COMPLETION MESSAGE
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'ZIPCODES SYNCHRONIZATION COMPLETE';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'The zipcodes column will now automatically sync';
  RAISE NOTICE 'with primary_zipcodes whenever territories change.';
  RAISE NOTICE '========================================';
END $$;
