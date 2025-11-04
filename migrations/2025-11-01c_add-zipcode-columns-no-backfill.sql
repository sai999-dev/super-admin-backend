-- Add zipcode pricing columns to subscription_plans without backfills to avoid schema mismatches
-- Date: 2025-11-01

BEGIN;

ALTER TABLE IF EXISTS public.subscription_plans
  ADD COLUMN IF NOT EXISTS plan_name TEXT,
  ADD COLUMN IF NOT EXISTS base_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS base_units INTEGER,
  ADD COLUMN IF NOT EXISTS additional_unit_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS trial_period_days INTEGER,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

COMMIT;
