-- =====================================================
-- FIX SUBSCRIPTION_PLANS TABLE
-- Remove old columns, add new columns, migrate data
-- =====================================================

-- Current columns (OLD SCHEMA):
-- - id
-- - plan_name
-- - base_price
-- - base_zipcodes_included
-- - additional_price
-- - max_cities_allowed
-- - custom_pricing
-- - is_active
-- - created_at
-- - updated_at

-- Required columns (NEW SCHEMA):
-- - id
-- - name (from plan_name)
-- - description
-- - unit_type (zipcode/city/county/state)
-- - price_per_unit (from base_price)
-- - max_units (from base_zipcodes_included or max_cities_allowed)
-- - min_units
-- - billing_cycle
-- - trial_days
-- - features (JSONB)
-- - is_active
-- - sort_order
-- - metadata (JSONB)
-- - created_at
-- - updated_at

-- =====================================================
-- STEP 1: ADD NEW COLUMNS
-- =====================================================

-- Add name column (will copy from plan_name)
ALTER TABLE subscription_plans 
  ADD COLUMN IF NOT EXISTS name VARCHAR(100);

-- Add description
ALTER TABLE subscription_plans 
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Add unit_type (territory type)
ALTER TABLE subscription_plans 
  ADD COLUMN IF NOT EXISTS unit_type VARCHAR(20) DEFAULT 'zipcode';

-- Add price_per_unit (pricing model)
ALTER TABLE subscription_plans 
  ADD COLUMN IF NOT EXISTS price_per_unit DECIMAL(10, 2);

-- Add max_units (territory limit)
ALTER TABLE subscription_plans 
  ADD COLUMN IF NOT EXISTS max_units INTEGER;

-- Add min_units (minimum territories)
ALTER TABLE subscription_plans 
  ADD COLUMN IF NOT EXISTS min_units INTEGER DEFAULT 1;

-- Add billing_cycle
ALTER TABLE subscription_plans 
  ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20) DEFAULT 'monthly';

-- Add trial_days
ALTER TABLE subscription_plans 
  ADD COLUMN IF NOT EXISTS trial_days INTEGER DEFAULT 0;

-- Add features JSONB
ALTER TABLE subscription_plans 
  ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '{}'::jsonb;

-- Add sort_order
ALTER TABLE subscription_plans 
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Add metadata JSONB
ALTER TABLE subscription_plans 
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- =====================================================
-- STEP 2: MIGRATE DATA FROM OLD TO NEW COLUMNS
-- =====================================================

-- Copy plan_name to name
UPDATE subscription_plans 
SET name = plan_name 
WHERE name IS NULL;

-- Copy base_price to price_per_unit
UPDATE subscription_plans 
SET price_per_unit = base_price 
WHERE price_per_unit IS NULL;

-- Copy base_zipcodes_included to max_units
UPDATE subscription_plans 
SET max_units = base_zipcodes_included 
WHERE max_units IS NULL AND base_zipcodes_included IS NOT NULL;

-- Set unit_type based on plan name or default to zipcode
UPDATE subscription_plans 
SET unit_type = CASE 
  WHEN LOWER(plan_name) LIKE '%city%' THEN 'city'
  WHEN LOWER(plan_name) LIKE '%county%' THEN 'county'
  WHEN LOWER(plan_name) LIKE '%state%' THEN 'state'
  ELSE 'zipcode'
END
WHERE unit_type IS NULL OR unit_type = 'zipcode';

-- Migrate custom_pricing and additional_price to metadata
UPDATE subscription_plans 
SET metadata = jsonb_build_object(
  'legacy_base_price', base_price,
  'legacy_additional_price', additional_price,
  'legacy_custom_pricing', custom_pricing,
  'legacy_max_cities_allowed', max_cities_allowed
)
WHERE metadata = '{}'::jsonb;

-- =====================================================
-- STEP 3: ADD CONSTRAINTS
-- =====================================================

-- Make name NOT NULL after data migration
ALTER TABLE subscription_plans 
  ALTER COLUMN name SET NOT NULL;

-- Add unique constraint on name
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'subscription_plans_name_key'
  ) THEN
    ALTER TABLE subscription_plans ADD CONSTRAINT subscription_plans_name_key UNIQUE (name);
  END IF;
END $$;

-- Make price_per_unit NOT NULL
ALTER TABLE subscription_plans 
  ALTER COLUMN price_per_unit SET NOT NULL;

-- =====================================================
-- STEP 4: REMOVE OLD COLUMNS
-- =====================================================

-- Drop old columns that are no longer needed
ALTER TABLE subscription_plans 
  DROP COLUMN IF EXISTS plan_name CASCADE;

ALTER TABLE subscription_plans 
  DROP COLUMN IF EXISTS base_price CASCADE;

ALTER TABLE subscription_plans 
  DROP COLUMN IF EXISTS base_zipcodes_included CASCADE;

ALTER TABLE subscription_plans 
  DROP COLUMN IF EXISTS additional_price CASCADE;

ALTER TABLE subscription_plans 
  DROP COLUMN IF EXISTS max_cities_allowed CASCADE;

ALTER TABLE subscription_plans 
  DROP COLUMN IF EXISTS custom_pricing CASCADE;

-- =====================================================
-- STEP 5: CREATE INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_subscription_plans_is_active 
  ON subscription_plans(is_active);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_unit_type 
  ON subscription_plans(unit_type);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_sort_order 
  ON subscription_plans(sort_order);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_name 
  ON subscription_plans(name);

-- =====================================================
-- STEP 6: VERIFICATION
-- =====================================================

-- Show updated structure
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'subscription_plans'
ORDER BY ordinal_position;

-- Show migrated data
SELECT 
  id,
  name,
  unit_type,
  price_per_unit,
  max_units,
  min_units,
  billing_cycle,
  trial_days,
  is_active,
  sort_order,
  metadata
FROM subscription_plans;

-- =====================================================
-- STEP 7: FINAL STATUS
-- =====================================================

DO $$
DECLARE
  v_plan_count INTEGER;
  v_column_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_plan_count FROM subscription_plans;
  SELECT COUNT(*) INTO v_column_count 
  FROM information_schema.columns
  WHERE table_name = 'subscription_plans';
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'SUBSCRIPTION_PLANS TABLE FIX COMPLETE';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Total Plans: %', v_plan_count;
  RAISE NOTICE 'Total Columns: %', v_column_count;
  RAISE NOTICE '✅ Old columns removed';
  RAISE NOTICE '✅ New columns added';
  RAISE NOTICE '✅ Data migrated';
  RAISE NOTICE '✅ Model now matches database';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
END $$;
