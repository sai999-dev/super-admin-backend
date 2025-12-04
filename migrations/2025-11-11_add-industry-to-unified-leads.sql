-- Migration: Add industry column to unified_leads table
-- Date: 2025-11-11
-- Description: Adds industry field to unified_leads table to support industry-specific lead routing

-- =====================================================
-- 1. ADD INDUSTRY COLUMN TO UNIFIED_LEADS TABLE
-- =====================================================

-- Add industry column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='unified_leads' AND column_name='industry'
    ) THEN
        ALTER TABLE unified_leads ADD COLUMN industry VARCHAR(50);
        RAISE NOTICE 'Added industry column to unified_leads';
    ELSE
        RAISE NOTICE 'Industry column already exists in unified_leads';
    END IF;
END $$;

-- Create index for industry column for faster filtering
CREATE INDEX IF NOT EXISTS idx_unified_leads_industry ON unified_leads(industry);

-- =====================================================
-- 2. POPULATE INDUSTRY FROM PORTALS TABLE (OPTIONAL)
-- =====================================================

-- Update existing records with industry from their associated portal
UPDATE unified_leads ul
SET industry = p.industry
FROM portals p
WHERE ul.portal_id::uuid = p.id
  AND ul.industry IS NULL
  AND p.industry IS NOT NULL;

-- =====================================================
-- 3. VERIFICATION
-- =====================================================

DO $$
DECLARE
    column_exists BOOLEAN;
    updated_count INTEGER;
BEGIN
    -- Check if column exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='unified_leads' AND column_name='industry'
    ) INTO column_exists;

    IF column_exists THEN
        -- Count records with industry
        SELECT COUNT(*) INTO updated_count
        FROM unified_leads
        WHERE industry IS NOT NULL;

        RAISE NOTICE '========================================';
        RAISE NOTICE 'MIGRATION COMPLETE';
        RAISE NOTICE '========================================';
        RAISE NOTICE 'Industry column exists: %', column_exists;
        RAISE NOTICE 'Records with industry: %', updated_count;
        RAISE NOTICE '========================================';
    ELSE
        RAISE EXCEPTION 'Migration failed: industry column does not exist';
    END IF;
END $$;
