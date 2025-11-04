-- Ensure subscription_plans has unit_type column for zipcode pricing model
-- Date: 2025-11-01

BEGIN;

-- Add unit_type if missing and default to 'zipcode'
ALTER TABLE IF EXISTS public.subscription_plans
  ADD COLUMN IF NOT EXISTS unit_type VARCHAR(20);

-- Set default and basic constraint if column exists now
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'subscription_plans'
      AND column_name = 'unit_type'
  ) THEN
    -- Set default to 'zipcode' if not already set
    ALTER TABLE public.subscription_plans
      ALTER COLUMN unit_type SET DEFAULT 'zipcode';

    -- Backfill NULLs to 'zipcode'
    UPDATE public.subscription_plans
    SET unit_type = 'zipcode'
    WHERE unit_type IS NULL;
  END IF;
END $$;

COMMIT;
