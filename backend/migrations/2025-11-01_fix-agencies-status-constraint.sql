-- Fix agencies status constraint to accept the correct values
-- Date: 2025-11-01
-- This migration ensures the agencies table status constraint matches what the code expects

BEGIN;

-- First, check and drop the existing constraint if it exists
DO $$
BEGIN
  -- Drop the old constraint if it exists (it might have a different name)
  ALTER TABLE public.agencies DROP CONSTRAINT IF EXISTS agencies_status_check1;
  ALTER TABLE public.agencies DROP CONSTRAINT IF EXISTS agencies_status_check;
  ALTER TABLE public.agencies DROP CONSTRAINT IF EXISTS agencies_status_checck;
  
  RAISE NOTICE 'Dropped existing status constraints';
END $$;

-- Add a new constraint that accepts both uppercase and lowercase values
-- This is more flexible and matches what the admin portal uses
DO $$
BEGIN
  ALTER TABLE public.agencies
  ADD CONSTRAINT agencies_status_check1
  CHECK (status IS NULL OR UPPER(status) IN ('ACTIVE', 'PENDING', 'SUSPENDED', 'DELETED', 'INACTIVE'));
  
  RAISE NOTICE 'Added new status constraint that accepts: ACTIVE, PENDING, SUSPENDED, DELETED, INACTIVE';
END $$;

-- Alternatively, if the constraint should only accept uppercase, use this:
-- ALTER TABLE public.agencies
-- ADD CONSTRAINT agencies_status_check1
-- CHECK (status IN ('ACTIVE', 'PENDING', 'SUSPENDED', 'DELETED', 'INACTIVE'));

COMMIT;

