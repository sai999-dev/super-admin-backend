-- Migration: Remove additional_unit_price column from subscription_plans table
-- Date: 2025-11-06
-- Description: This field is no longer used in the subscription plan model

-- Remove the additional_unit_price column from subscription_plans table
ALTER TABLE subscription_plans 
DROP COLUMN IF EXISTS additional_unit_price;

-- Also remove additional_price if it exists (alternative naming)
ALTER TABLE subscription_plans 
DROP COLUMN IF EXISTS additional_price;

-- Refresh PostgREST schema cache (if using PostgREST)
-- This ensures API endpoints reflect the schema change
NOTIFY pgrst, 'reload schema';

