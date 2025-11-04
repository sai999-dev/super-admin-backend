-- Migration: Enable RLS on Newly Created Tables
-- Date: 2025-01-21
-- Description: Enables RLS on the 7 newly created tables (billing_history, transactions, notifications, push_notifications, admin_activity_logs, webhook_audit, lead_purchases)
-- Note: Some tables may already have RLS from previous migrations, but this ensures all are secured

BEGIN;

-- =====================================================
-- 1. BILLING_HISTORY
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'billing_history') THEN
        ALTER TABLE billing_history ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "Agencies can view their billing" ON billing_history;
        DROP POLICY IF EXISTS "Service role full access to billing_history" ON billing_history;
        
        CREATE POLICY "Agencies can view their billing" 
        ON billing_history FOR SELECT 
        TO authenticated 
        USING (
          agency_id::text = auth.uid()::text 
          OR auth.role() = 'service_role'
        );

        CREATE POLICY "Service role full access to billing_history" 
        ON billing_history FOR ALL 
        TO service_role 
        USING (true)
        WITH CHECK (true);
        
        RAISE NOTICE 'RLS enabled on billing_history';
    END IF;
END $$;

-- =====================================================
-- 2. TRANSACTIONS
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transactions') THEN
        ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "Agencies can view their transactions" ON transactions;
        DROP POLICY IF EXISTS "Service role full access to transactions" ON transactions;
        
        CREATE POLICY "Agencies can view their transactions" 
        ON transactions FOR SELECT 
        TO authenticated 
        USING (
          agency_id::text = auth.uid()::text 
          OR auth.role() = 'service_role'
        );

        CREATE POLICY "Service role full access to transactions" 
        ON transactions FOR ALL 
        TO service_role 
        USING (true)
        WITH CHECK (true);
        
        RAISE NOTICE 'RLS enabled on transactions';
    END IF;
END $$;

-- =====================================================
-- 3. NOTIFICATIONS
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
        ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "Agencies can view their notifications" ON notifications;
        DROP POLICY IF EXISTS "Agencies can update their notifications" ON notifications;
        DROP POLICY IF EXISTS "Service role full access to notifications" ON notifications;
        
        CREATE POLICY "Agencies can view their notifications" 
        ON notifications FOR SELECT 
        TO authenticated 
        USING (
          agency_id::text = auth.uid()::text 
          OR auth.role() = 'service_role'
        );

        CREATE POLICY "Agencies can update their notifications" 
        ON notifications FOR UPDATE 
        TO authenticated 
        USING (
          agency_id::text = auth.uid()::text 
          OR auth.role() = 'service_role'
        );

        CREATE POLICY "Service role full access to notifications" 
        ON notifications FOR ALL 
        TO service_role 
        USING (true)
        WITH CHECK (true);
        
        RAISE NOTICE 'RLS enabled on notifications';
    END IF;
END $$;

-- =====================================================
-- 4. PUSH_NOTIFICATIONS
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'push_notifications') THEN
        ALTER TABLE push_notifications ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "Agencies can view their push notifications" ON push_notifications;
        DROP POLICY IF EXISTS "Service role full access to push_notifications" ON push_notifications;
        
        CREATE POLICY "Agencies can view their push notifications" 
        ON push_notifications FOR SELECT 
        TO authenticated 
        USING (
          agency_id::text = auth.uid()::text 
          OR auth.role() = 'service_role'
        );

        CREATE POLICY "Service role full access to push_notifications" 
        ON push_notifications FOR ALL 
        TO service_role 
        USING (true)
        WITH CHECK (true);
        
        RAISE NOTICE 'RLS enabled on push_notifications';
    END IF;
END $$;

-- =====================================================
-- 5. ADMIN_ACTIVITY_LOGS
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_activity_logs') THEN
        ALTER TABLE admin_activity_logs ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "Allow read access for authenticated admin users" ON admin_activity_logs;
        DROP POLICY IF EXISTS "Service role full access to admin_activity_logs" ON admin_activity_logs;
        
        CREATE POLICY "Allow read access for authenticated admin users" 
        ON admin_activity_logs FOR SELECT 
        TO authenticated 
        USING (
          EXISTS (
            SELECT 1 FROM users 
            WHERE users.id::text = auth.uid()::text 
            AND users.role IN ('super_admin', 'admin')
          )
          OR auth.role() = 'service_role'
        );

        CREATE POLICY "Service role full access to admin_activity_logs" 
        ON admin_activity_logs FOR ALL 
        TO service_role 
        USING (true)
        WITH CHECK (true);
        
        RAISE NOTICE 'RLS enabled on admin_activity_logs';
    END IF;
END $$;

-- =====================================================
-- 6. WEBHOOK_AUDIT
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'webhook_audit') THEN
        ALTER TABLE webhook_audit ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "Allow read access for authenticated users" ON webhook_audit;
        DROP POLICY IF EXISTS "Service role full access to webhook_audit" ON webhook_audit;
        
        CREATE POLICY "Allow read access for authenticated users" 
        ON webhook_audit FOR SELECT 
        TO authenticated 
        USING (true);

        CREATE POLICY "Service role full access to webhook_audit" 
        ON webhook_audit FOR ALL 
        TO service_role 
        USING (true)
        WITH CHECK (true);
        
        RAISE NOTICE 'RLS enabled on webhook_audit';
    END IF;
END $$;

-- =====================================================
-- 7. LEAD_PURCHASES
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lead_purchases') THEN
        ALTER TABLE lead_purchases ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "Agencies can view their lead purchases" ON lead_purchases;
        DROP POLICY IF EXISTS "Service role full access to lead_purchases" ON lead_purchases;
        
        CREATE POLICY "Agencies can view their lead purchases" 
        ON lead_purchases FOR SELECT 
        TO authenticated 
        USING (
          agency_id::text = auth.uid()::text 
          OR auth.role() = 'service_role'
        );

        CREATE POLICY "Service role full access to lead_purchases" 
        ON lead_purchases FOR ALL 
        TO service_role 
        USING (true)
        WITH CHECK (true);
        
        RAISE NOTICE 'RLS enabled on lead_purchases';
    END IF;
END $$;

COMMIT;

-- =====================================================
-- Verification
-- =====================================================
-- Run this query to verify RLS is enabled:
-- SELECT tablename, relrowsecurity 
-- FROM pg_tables t
-- JOIN pg_class c ON c.relname = t.tablename
-- WHERE t.schemaname = 'public'
-- AND t.tablename IN ('billing_history', 'transactions', 'notifications', 'push_notifications', 'admin_activity_logs', 'webhook_audit', 'lead_purchases')
-- ORDER BY tablename;

