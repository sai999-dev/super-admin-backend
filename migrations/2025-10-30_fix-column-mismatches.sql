-- Fix Column Mismatches Between Code and Database
-- Date: 2025-10-30
-- This migration ensures database columns match what Flutter and Admin Portal expect

BEGIN;

-- =====================================================
-- 1. AGENCIES TABLE - Add missing columns
-- =====================================================

-- Add agency_id if it doesn't exist (for backward compatibility)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
    AND table_name = 'agencies' 
    AND column_name = 'agency_id'
  ) THEN
    ALTER TABLE agencies ADD COLUMN agency_id UUID DEFAULT gen_random_uuid();
    -- Populate agency_id from id for existing rows
    UPDATE agencies SET agency_id = id WHERE agency_id IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_agencies_agency_id ON agencies(agency_id);
    RAISE NOTICE 'Added agency_id column to agencies';
  END IF;
END $$;

-- Add agency_name if it doesn't exist (alias for business_name)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
    AND table_name = 'agencies' 
    AND column_name = 'agency_name'
  ) THEN
    ALTER TABLE agencies ADD COLUMN agency_name VARCHAR(255);
    -- Copy from business_name
    UPDATE agencies SET agency_name = business_name WHERE agency_name IS NULL;
    RAISE NOTICE 'Added agency_name column to agencies';
  END IF;
END $$;

-- Add name if it doesn't exist (alias for business_name)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
    AND table_name = 'agencies' 
    AND column_name = 'name'
  ) THEN
    ALTER TABLE agencies ADD COLUMN name VARCHAR(255);
    -- Copy from business_name
    UPDATE agencies SET name = business_name WHERE name IS NULL;
    RAISE NOTICE 'Added name column to agencies';
  END IF;
END $$;

-- Add is_active if it doesn't exist (derived from status)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
    AND table_name = 'agencies' 
    AND column_name = 'is_active'
  ) THEN
    ALTER TABLE agencies ADD COLUMN is_active BOOLEAN DEFAULT true;
    -- Set based on status
    UPDATE agencies SET is_active = (status = 'active' OR status = 'ACTIVE');
    RAISE NOTICE 'Added is_active column to agencies';
  END IF;
END $$;

-- =====================================================
-- 2. SUBSCRIPTIONS TABLE - Add missing columns
-- =====================================================

-- Add start_date if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
    AND table_name = 'subscriptions' 
    AND column_name = 'start_date'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN start_date TIMESTAMP;
    -- Copy from current_period_start or created_at
    UPDATE subscriptions 
    SET start_date = COALESCE(current_period_start, created_at) 
    WHERE start_date IS NULL;
    RAISE NOTICE 'Added start_date column to subscriptions';
  END IF;
END $$;

-- Add trial_end_date if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
    AND table_name = 'subscriptions' 
    AND column_name = 'trial_end_date'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN trial_end_date TIMESTAMP;
    -- Copy from trial_end if it exists
    UPDATE subscriptions 
    SET trial_end_date = trial_end 
    WHERE trial_end_date IS NULL AND trial_end IS NOT NULL;
    RAISE NOTICE 'Added trial_end_date column to subscriptions';
  END IF;
END $$;

-- Add end_date if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
    AND table_name = 'subscriptions' 
    AND column_name = 'end_date'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN end_date TIMESTAMP;
    -- Copy from current_period_end
    UPDATE subscriptions 
    SET end_date = current_period_end 
    WHERE end_date IS NULL;
    RAISE NOTICE 'Added end_date column to subscriptions';
  END IF;
END $$;

-- Add current_units if it doesn't exist (for territory count)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
    AND table_name = 'subscriptions' 
    AND column_name = 'current_units'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN current_units INTEGER DEFAULT 0;
    -- Initialize from territories count
    UPDATE subscriptions s
    SET current_units = (
      SELECT COUNT(*) 
      FROM territories t 
      WHERE t.subscription_id = s.id AND t.is_active = true
    )
    WHERE current_units = 0;
    RAISE NOTICE 'Added current_units column to subscriptions';
  END IF;
END $$;

-- Add next_billing_date if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
    AND table_name = 'subscriptions' 
    AND column_name = 'next_billing_date'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN next_billing_date TIMESTAMP;
    -- Copy from current_period_end
    UPDATE subscriptions 
    SET next_billing_date = current_period_end 
    WHERE next_billing_date IS NULL;
    RAISE NOTICE 'Added next_billing_date column to subscriptions';
  END IF;
END $$;

-- =====================================================
-- 3. TERRITORIES TABLE - Add zipcode column
-- =====================================================

-- Add zipcode column (extract from value if type is 'zipcode')
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
    AND table_name = 'territories' 
    AND column_name = 'zipcode'
  ) THEN
    ALTER TABLE territories ADD COLUMN zipcode VARCHAR(20);
    -- Copy from value where type is zipcode
    UPDATE territories 
    SET zipcode = value 
    WHERE zipcode IS NULL AND type = 'zipcode';
    RAISE NOTICE 'Added zipcode column to territories';
  END IF;
END $$;

-- Add city and county columns if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
    AND table_name = 'territories' 
    AND column_name = 'city'
  ) THEN
    ALTER TABLE territories ADD COLUMN city VARCHAR(100);
    RAISE NOTICE 'Added city column to territories';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
    AND table_name = 'territories' 
    AND column_name = 'county'
  ) THEN
    ALTER TABLE territories ADD COLUMN county VARCHAR(100);
    RAISE NOTICE 'Added county column to territories';
  END IF;
END $$;

-- Add priority column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
    AND table_name = 'territories' 
    AND column_name = 'priority'
  ) THEN
    ALTER TABLE territories ADD COLUMN priority INTEGER DEFAULT 1;
    RAISE NOTICE 'Added priority column to territories';
  END IF;
END $$;

COMMIT;

-- =====================================================
-- VERIFICATION
-- =====================================================
-- Verify all columns were added
SELECT 
  'agencies' as table_name,
  COUNT(*) FILTER (WHERE column_name IN ('id', 'agency_id', 'business_name', 'agency_name', 'name', 'is_active')) as expected_columns
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'agencies'

UNION ALL

SELECT 
  'subscriptions' as table_name,
  COUNT(*) FILTER (WHERE column_name IN ('id', 'agency_id', 'start_date', 'trial_end_date', 'end_date', 'current_units', 'next_billing_date')) as expected_columns
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'subscriptions'

UNION ALL

SELECT 
  'territories' as table_name,
  COUNT(*) FILTER (WHERE column_name IN ('id', 'subscription_id', 'agency_id', 'type', 'value', 'zipcode', 'city', 'county', 'is_active', 'priority')) as expected_columns
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'territories';

