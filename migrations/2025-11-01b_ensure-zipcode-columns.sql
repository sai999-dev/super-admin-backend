-- Ensure zipcode pricing columns exist on subscription_plans (idempotent, independent)
-- Date: 2025-11-01

BEGIN;

ALTER TABLE IF EXISTS public.subscription_plans
  ADD COLUMN IF NOT EXISTS plan_name TEXT,
  ADD COLUMN IF NOT EXISTS base_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS base_units INTEGER,
  ADD COLUMN IF NOT EXISTS additional_unit_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS trial_period_days INTEGER,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Backfill plan_name from name when missing
UPDATE public.subscription_plans
SET plan_name = COALESCE(plan_name, name)
WHERE plan_name IS NULL;

-- Approximate base_price if missing and price_per_unit/min_units exist
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
