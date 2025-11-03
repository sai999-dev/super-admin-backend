-- Migration: Enable RLS on Remaining Tables
-- Date: 2025-01-21
-- Description: Enables RLS on tables that were missed in the initial migration
-- Tables: industries, payments, portal_schema_mappings, portals_backup

BEGIN;

-- =====================================================
-- 1. INDUSTRIES (Reference Data)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'industries') THEN
        ALTER TABLE industries ENABLE ROW LEVEL SECURITY;
        
        -- Drop existing policies if they exist
        DROP POLICY IF EXISTS "Allow read access for authenticated users" ON industries;
        DROP POLICY IF EXISTS "Service role full access to industries" ON industries;
        
        -- Reference data - allow read access to authenticated users
        CREATE POLICY "Allow read access for authenticated users" 
        ON industries FOR SELECT 
        TO authenticated 
        USING (true);

        -- Service role has full access
        CREATE POLICY "Service role full access to industries" 
        ON industries FOR ALL 
        TO service_role 
        USING (true)
        WITH CHECK (true);
        
        RAISE NOTICE 'RLS enabled on industries';
    ELSE
        RAISE NOTICE 'industries table does not exist, skipping';
    END IF;
END $$;

-- =====================================================
-- 2. PAYMENTS (Sensitive Financial Data - HIGH PRIORITY)
-- =====================================================
DO $$
DECLARE
    has_agency_id BOOLEAN;
    has_subscription_id BOOLEAN;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payments') THEN
        -- Check what columns exist in payments table
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'payments' AND column_name = 'agency_id'
        ) INTO has_agency_id;
        
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'payments' AND column_name = 'subscription_id'
        ) INTO has_subscription_id;
        
        ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
        
        -- Drop existing policies if they exist
        DROP POLICY IF EXISTS "Agencies can view their payments" ON payments;
        DROP POLICY IF EXISTS "Service role full access to payments" ON payments;
        
        -- Create policy based on available columns
        IF has_agency_id THEN
            -- Direct agency_id column exists
            CREATE POLICY "Agencies can view their payments" 
            ON payments FOR SELECT 
            TO authenticated 
            USING (
              agency_id::text = auth.uid()::text 
              OR auth.role() = 'service_role'
            );
        ELSIF has_subscription_id THEN
            -- Use subscription relationship
            CREATE POLICY "Agencies can view their payments" 
            ON payments FOR SELECT 
            TO authenticated 
            USING (
              EXISTS (
                SELECT 1 FROM subscriptions s
                WHERE s.agency_id::text = auth.uid()::text
                AND s.id = payments.subscription_id
              )
              OR auth.role() = 'service_role'
            );
        ELSE
            -- No agency/subscription column - service role only
            CREATE POLICY "Allow service role only for payments" 
            ON payments FOR ALL 
            TO service_role 
            USING (true)
            WITH CHECK (true);
            
            RAISE NOTICE 'payments table has no agency_id or subscription_id - using service role only';
        END IF;

        -- Service role has full access (for admin operations)
        CREATE POLICY "Service role full access to payments" 
        ON payments FOR ALL 
        TO service_role 
        USING (true)
        WITH CHECK (true);
        
        RAISE NOTICE 'RLS enabled on payments';
    ELSE
        RAISE NOTICE 'payments table does not exist, skipping';
    END IF;
END $$;

-- =====================================================
-- 3. PORTAL SCHEMA MAPPINGS
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'portal_schema_mappings') THEN
        ALTER TABLE portal_schema_mappings ENABLE ROW LEVEL SECURITY;
        
        -- Drop existing policies if they exist
        DROP POLICY IF EXISTS "Allow read access for authenticated users" ON portal_schema_mappings;
        DROP POLICY IF EXISTS "Service role full access to portal_schema_mappings" ON portal_schema_mappings;
        
        -- Allow authenticated users to read (portal configuration)
        CREATE POLICY "Allow read access for authenticated users" 
        ON portal_schema_mappings FOR SELECT 
        TO authenticated 
        USING (true);

        -- Service role has full access
        CREATE POLICY "Service role full access to portal_schema_mappings" 
        ON portal_schema_mappings FOR ALL 
        TO service_role 
        USING (true)
        WITH CHECK (true);
        
        RAISE NOTICE 'RLS enabled on portal_schema_mappings';
    ELSE
        RAISE NOTICE 'portal_schema_mappings table does not exist, skipping';
    END IF;
END $$;

-- =====================================================
-- 4. PORTALS BACKUP (Backup Table)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'portals_backup') THEN
        ALTER TABLE portals_backup ENABLE ROW LEVEL SECURITY;
        
        -- Drop existing policies if they exist
        DROP POLICY IF EXISTS "Allow service role only" ON portals_backup;
        
        -- Backup table - service role only (no user access needed)
        CREATE POLICY "Allow service role only" 
        ON portals_backup FOR ALL 
        TO service_role 
        USING (true)
        WITH CHECK (true);
        
        RAISE NOTICE 'RLS enabled on portals_backup';
    ELSE
        RAISE NOTICE 'portals_backup table does not exist, skipping';
    END IF;
END $$;

COMMIT;

-- =====================================================
-- VERIFICATION
-- =====================================================
DO $$
DECLARE
    r record;
    count INTEGER := 0;
BEGIN
    RAISE NOTICE 'RLS Status Check for Remaining Tables:';
    FOR r IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
        AND tablename IN ('industries', 'payments', 'portal_schema_mappings', 'portals_backup')
        ORDER BY tablename
    LOOP
        IF EXISTS (
            SELECT 1 FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
            AND c.relname = r.tablename
            AND c.relrowsecurity = true
        ) THEN
            RAISE NOTICE 'Table: % - RLS Enabled ✅', r.tablename;
            count := count + 1;
        ELSE
            RAISE NOTICE 'Table: % - RLS Disabled ❌', r.tablename;
        END IF;
    END LOOP;
    RAISE NOTICE 'Total tables with RLS: %', count;
END $$;

