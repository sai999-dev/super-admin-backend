-- Add zipcode-based pricing fields to subscription_plans
-- Date: 2025-11-01

BEGIN;

-- Ensure columns exist for zipcode pricing model
ALTER TABLE IF EXISTS public.subscription_plans
  ADD COLUMN IF NOT EXISTS plan_name TEXT,
  ADD COLUMN IF NOT EXISTS base_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS base_units INTEGER,
  ADD COLUMN IF NOT EXISTS additional_unit_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS trial_period_days INTEGER,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Ensure unit_type defaults to zipcode if not set
ALTER TABLE IF EXISTS public.subscription_plans
  ALTER COLUMN unit_type SET DEFAULT 'zipcode';

-- Backfill plan_name from name when missing
UPDATE public.subscription_plans
SET plan_name = COALESCE(plan_name, name)
WHERE plan_name IS NULL;

-- If base_price is NULL but price_per_unit/min_units exist, approximate base_price
UPDATE public.subscription_plans
SET base_price = 
  CASE 
    WHEN base_price IS NULL AND price_per_unit IS NOT NULL AND (min_units IS NOT NULL AND min_units > 0)
      THEN (price_per_unit * min_units)
    WHEN base_price IS NULL AND price_per_unit IS NOT NULL AND (min_units IS NULL OR min_units = 0)
      THEN price_per_unit
    ELSE base_price
  END,
    base_units = COALESCE(base_units, NULLIF(min_units, 0))
WHERE (base_price IS NULL OR base_units IS NULL);

COMMIT;
