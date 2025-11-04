-- Migration: Enable Row Level Security (RLS) on Public Tables
-- Date: 2025-01-21
-- Description: Enables RLS on all public tables for security
-- Addresses: 17 security issues shown in Supabase dashboard

BEGIN;

-- =====================================================
-- 1. PORTAL SCHEMA FIELDS (Critical - shown in dashboard)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'portal_schema_fields') THEN
        ALTER TABLE portal_schema_fields ENABLE ROW LEVEL SECURITY;
        
        -- Drop existing policies if they exist
        DROP POLICY IF EXISTS "Allow read access for authenticated users" ON portal_schema_fields;
        DROP POLICY IF EXISTS "Allow service role full access" ON portal_schema_fields;
        
        -- Policy: Allow authenticated users to read
        CREATE POLICY "Allow read access for authenticated users" 
        ON portal_schema_fields FOR SELECT 
        TO authenticated 
        USING (true);

        -- Policy: Allow service role to manage (for admin operations)
        CREATE POLICY "Allow service role full access" 
        ON portal_schema_fields FOR ALL 
        TO service_role 
        USING (true)
        WITH CHECK (true);
        
        RAISE NOTICE 'RLS enabled on portal_schema_fields';
    ELSE
        RAISE NOTICE 'portal_schema_fields table does not exist, skipping';
    END IF;
END $$;

-- =====================================================
-- 2. AGENCIES (if exists)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agencies') THEN
        ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "Agencies can view their own data" ON agencies;
        DROP POLICY IF EXISTS "Service role full access to agencies" ON agencies;
        
        CREATE POLICY "Agencies can view their own data" 
        ON agencies FOR SELECT 
        TO authenticated 
        USING (auth.uid()::text = id::text OR auth.role() = 'service_role');

        CREATE POLICY "Service role full access to agencies" 
        ON agencies FOR ALL 
        TO service_role 
        USING (true)
        WITH CHECK (true);
        
        RAISE NOTICE 'RLS enabled on agencies';
    ELSE
        RAISE NOTICE 'agencies table does not exist, skipping';
    END IF;
END $$;

-- =====================================================
-- 3. USERS (if exists)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
        ALTER TABLE users ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "Users can view their own data" ON users;
        DROP POLICY IF EXISTS "Service role full access to users" ON users;
        
        CREATE POLICY "Users can view their own data" 
        ON users FOR SELECT 
        TO authenticated 
        USING (auth.uid()::text = id::text OR auth.role() = 'service_role');

        CREATE POLICY "Service role full access to users" 
        ON users FOR ALL 
        TO service_role 
        USING (true)
        WITH CHECK (true);
        
        RAISE NOTICE 'RLS enabled on users';
    ELSE
        RAISE NOTICE 'users table does not exist, skipping';
    END IF;
END $$;

-- =====================================================
-- 4. LEADS (if exists)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'leads') THEN
        ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "Agencies can view assigned leads" ON leads;
        DROP POLICY IF EXISTS "Service role full access to leads" ON leads;
        
        CREATE POLICY "Agencies can view assigned leads" 
        ON leads FOR SELECT 
        TO authenticated 
        USING (
          EXISTS (
            SELECT 1 FROM lead_assignments 
            WHERE lead_assignments.lead_id = leads.id 
            AND lead_assignments.agency_id::text = auth.uid()::text
          )
          OR auth.role() = 'service_role'
        );

        CREATE POLICY "Service role full access to leads" 
        ON leads FOR ALL 
        TO service_role 
        USING (true)
        WITH CHECK (true);
        
        RAISE NOTICE 'RLS enabled on leads';
    ELSE
        RAISE NOTICE 'leads table does not exist, skipping';
    END IF;
END $$;

-- =====================================================
-- 5. LEAD ASSIGNMENTS (if exists)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lead_assignments') THEN
        ALTER TABLE lead_assignments ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "Agencies can view their assignments" ON lead_assignments;
        DROP POLICY IF EXISTS "Agencies can update their assignments" ON lead_assignments;
        DROP POLICY IF EXISTS "Service role full access to lead_assignments" ON lead_assignments;
        
        CREATE POLICY "Agencies can view their assignments" 
        ON lead_assignments FOR SELECT 
        TO authenticated 
        USING (
          agency_id::text = auth.uid()::text 
          OR auth.role() = 'service_role'
        );

        CREATE POLICY "Agencies can update their assignments" 
        ON lead_assignments FOR UPDATE 
        TO authenticated 
        USING (agency_id::text = auth.uid()::text)
        WITH CHECK (agency_id::text = auth.uid()::text);

        CREATE POLICY "Service role full access to lead_assignments" 
        ON lead_assignments FOR ALL 
        TO service_role 
        USING (true)
        WITH CHECK (true);
        
        RAISE NOTICE 'RLS enabled on lead_assignments';
    ELSE
        RAISE NOTICE 'lead_assignments table does not exist, skipping';
    END IF;
END $$;

-- =====================================================
-- 6. PORTALS (if exists)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'portals') THEN
        ALTER TABLE portals ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "Allow read access for authenticated users" ON portals;
        DROP POLICY IF EXISTS "Service role full access to portals" ON portals;
        
        CREATE POLICY "Allow read access for authenticated users" 
        ON portals FOR SELECT 
        TO authenticated 
        USING (true);

        CREATE POLICY "Service role full access to portals" 
        ON portals FOR ALL 
        TO service_role 
        USING (true)
        WITH CHECK (true);
        
        RAISE NOTICE 'RLS enabled on portals';
    ELSE
        RAISE NOTICE 'portals table does not exist, skipping';
    END IF;
END $$;

-- =====================================================
-- 7. SUBSCRIPTION PLANS (Public read, admin write) (if exists)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subscription_plans') THEN
        ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "Allow public read access to plans" ON subscription_plans;
        DROP POLICY IF EXISTS "Service role full access to subscription_plans" ON subscription_plans;
        
        CREATE POLICY "Allow public read access to plans" 
        ON subscription_plans FOR SELECT 
        TO anon, authenticated 
        USING (is_active = true);

        CREATE POLICY "Service role full access to subscription_plans" 
        ON subscription_plans FOR ALL 
        TO service_role 
        USING (true)
        WITH CHECK (true);
        
        RAISE NOTICE 'RLS enabled on subscription_plans';
    ELSE
        RAISE NOTICE 'subscription_plans table does not exist, skipping';
    END IF;
END $$;

-- =====================================================
-- 8. SUBSCRIPTIONS (if exists)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subscriptions') THEN
        ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "Agencies can view their subscriptions" ON subscriptions;
        DROP POLICY IF EXISTS "Service role full access to subscriptions" ON subscriptions;
        
        CREATE POLICY "Agencies can view their subscriptions" 
        ON subscriptions FOR SELECT 
        TO authenticated 
        USING (
          agency_id::text = auth.uid()::text 
          OR auth.role() = 'service_role'
        );

        CREATE POLICY "Service role full access to subscriptions" 
        ON subscriptions FOR ALL 
        TO service_role 
        USING (true)
        WITH CHECK (true);
        
        RAISE NOTICE 'RLS enabled on subscriptions';
    ELSE
        RAISE NOTICE 'subscriptions table does not exist, skipping';
    END IF;
END $$;

-- =====================================================
-- 9. TERRITORIES (if exists)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'territories') THEN
        ALTER TABLE territories ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "Agencies can view their territories" ON territories;
        DROP POLICY IF EXISTS "Agencies can manage their territories" ON territories;
        DROP POLICY IF EXISTS "Service role full access to territories" ON territories;
        
        CREATE POLICY "Agencies can view their territories" 
        ON territories FOR SELECT 
        TO authenticated 
        USING (
          agency_id::text = auth.uid()::text 
          OR auth.role() = 'service_role'
        );

        CREATE POLICY "Agencies can manage their territories" 
        ON territories FOR ALL 
        TO authenticated 
        USING (agency_id::text = auth.uid()::text)
        WITH CHECK (agency_id::text = auth.uid()::text);

        CREATE POLICY "Service role full access to territories" 
        ON territories FOR ALL 
        TO service_role 
        USING (true)
        WITH CHECK (true);
        
        RAISE NOTICE 'RLS enabled on territories';
    ELSE
        RAISE NOTICE 'territories table does not exist, skipping';
    END IF;
END $$;

-- =====================================================
-- 10. BILLING HISTORY (if exists)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'billing_history') THEN
        ALTER TABLE billing_history ENABLE ROW LEVEL SECURITY;
        
        -- Drop existing policies if they exist
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
    ELSE
        RAISE NOTICE 'billing_history table does not exist, skipping';
    END IF;
END $$;

-- =====================================================
-- 11. TRANSACTIONS (if exists)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transactions') THEN
        ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
        
        -- Drop existing policies if they exist
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
    ELSE
        RAISE NOTICE 'transactions table does not exist, skipping';
    END IF;
END $$;

-- =====================================================
-- 12. LEAD NOTES (if exists)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lead_notes') THEN
        ALTER TABLE lead_notes ENABLE ROW LEVEL SECURITY;
        
        -- Drop existing policies if they exist
        DROP POLICY IF EXISTS "Agencies can view notes on their leads" ON lead_notes;
        DROP POLICY IF EXISTS "Agencies can add notes to their leads" ON lead_notes;
        DROP POLICY IF EXISTS "Service role full access to lead_notes" ON lead_notes;
        
        CREATE POLICY "Agencies can view notes on their leads" 
        ON lead_notes FOR SELECT 
        TO authenticated 
        USING (
          agency_id::text = auth.uid()::text 
          OR auth.role() = 'service_role'
        );

        CREATE POLICY "Agencies can add notes to their leads" 
        ON lead_notes FOR INSERT 
        TO authenticated 
        WITH CHECK (agency_id::text = auth.uid()::text);

        CREATE POLICY "Service role full access to lead_notes" 
        ON lead_notes FOR ALL 
        TO service_role 
        USING (true)
        WITH CHECK (true);
        
        RAISE NOTICE 'RLS enabled on lead_notes';
    ELSE
        RAISE NOTICE 'lead_notes table does not exist, skipping';
    END IF;
END $$;

-- =====================================================
-- 13. LEAD INTERACTIONS (if exists)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lead_interactions') THEN
        ALTER TABLE lead_interactions ENABLE ROW LEVEL SECURITY;
        
        -- Drop existing policies if they exist
        DROP POLICY IF EXISTS "Agencies can view interactions on their leads" ON lead_interactions;
        DROP POLICY IF EXISTS "Agencies can log interactions" ON lead_interactions;
        DROP POLICY IF EXISTS "Service role full access to lead_interactions" ON lead_interactions;
        
        CREATE POLICY "Agencies can view interactions on their leads" 
        ON lead_interactions FOR SELECT 
        TO authenticated 
        USING (
          agency_id::text = auth.uid()::text 
          OR auth.role() = 'service_role'
        );

        CREATE POLICY "Agencies can log interactions" 
        ON lead_interactions FOR INSERT 
        TO authenticated 
        WITH CHECK (agency_id::text = auth.uid()::text);

        CREATE POLICY "Service role full access to lead_interactions" 
        ON lead_interactions FOR ALL 
        TO service_role 
        USING (true)
        WITH CHECK (true);
        
        RAISE NOTICE 'RLS enabled on lead_interactions';
    ELSE
        RAISE NOTICE 'lead_interactions table does not exist, skipping';
    END IF;
END $$;

-- =====================================================
-- 14. LEAD STATUS HISTORY (if exists)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lead_status_history') THEN
        ALTER TABLE lead_status_history ENABLE ROW LEVEL SECURITY;
        
        -- Drop existing policies if they exist
        DROP POLICY IF EXISTS "Allow read access for authenticated users" ON lead_status_history;
        DROP POLICY IF EXISTS "Service role full access to lead_status_history" ON lead_status_history;
        
        CREATE POLICY "Allow read access for authenticated users" 
        ON lead_status_history FOR SELECT 
        TO authenticated 
        USING (true);

        CREATE POLICY "Service role full access to lead_status_history" 
        ON lead_status_history FOR ALL 
        TO service_role 
        USING (true)
        WITH CHECK (true);
        
        RAISE NOTICE 'RLS enabled on lead_status_history';
    ELSE
        RAISE NOTICE 'lead_status_history table does not exist, skipping';
    END IF;
END $$;

-- =====================================================
-- 15. LEAD VIEWS (if exists)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lead_views') THEN
        ALTER TABLE lead_views ENABLE ROW LEVEL SECURITY;
        
        -- Drop existing policies if they exist
        DROP POLICY IF EXISTS "Agencies can view their lead views" ON lead_views;
        DROP POLICY IF EXISTS "Agencies can track views" ON lead_views;
        DROP POLICY IF EXISTS "Service role full access to lead_views" ON lead_views;
        
        CREATE POLICY "Agencies can view their lead views" 
        ON lead_views FOR SELECT 
        TO authenticated 
        USING (
          agency_id::text = auth.uid()::text 
          OR auth.role() = 'service_role'
        );

        CREATE POLICY "Agencies can track views" 
        ON lead_views FOR INSERT 
        TO authenticated 
        WITH CHECK (agency_id::text = auth.uid()::text);

        CREATE POLICY "Service role full access to lead_views" 
        ON lead_views FOR ALL 
        TO service_role 
        USING (true)
        WITH CHECK (true);
        
        RAISE NOTICE 'RLS enabled on lead_views';
    ELSE
        RAISE NOTICE 'lead_views table does not exist, skipping';
    END IF;
END $$;

-- =====================================================
-- 16. WEBHOOK DELIVERIES (if exists)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'webhook_deliveries') THEN
        ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "Allow read access for authenticated users" ON webhook_deliveries;
        DROP POLICY IF EXISTS "Service role full access to webhook_deliveries" ON webhook_deliveries;
        
        CREATE POLICY "Allow read access for authenticated users" 
        ON webhook_deliveries FOR SELECT 
        TO authenticated 
        USING (true);

        CREATE POLICY "Service role full access to webhook_deliveries" 
        ON webhook_deliveries FOR ALL 
        TO service_role 
        USING (true)
        WITH CHECK (true);
        
        RAISE NOTICE 'RLS enabled on webhook_deliveries';
    ELSE
        RAISE NOTICE 'webhook_deliveries table does not exist, skipping';
    END IF;
END $$;

-- =====================================================
-- 17. WEBHOOK AUDIT (if exists)
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
    ELSE
        RAISE NOTICE 'webhook_audit table does not exist, skipping';
    END IF;
END $$;

-- =====================================================
-- 18. PASSWORD RESET TOKENS (if exists)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'password_reset_tokens') THEN
        ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "Allow service role only" ON password_reset_tokens;
        
        CREATE POLICY "Allow service role only" 
        ON password_reset_tokens FOR ALL 
        TO service_role 
        USING (true)
        WITH CHECK (true);
        
        RAISE NOTICE 'RLS enabled on password_reset_tokens';
    ELSE
        RAISE NOTICE 'password_reset_tokens table does not exist, skipping';
    END IF;
END $$;

-- =====================================================
-- 19. AUDIT LOGS (if exists)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs') THEN
        ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "Allow read access for authenticated users" ON audit_logs;
        DROP POLICY IF EXISTS "Service role full access to audit_logs" ON audit_logs;
        
        CREATE POLICY "Allow read access for authenticated users" 
        ON audit_logs FOR SELECT 
        TO authenticated 
        USING (true);

        CREATE POLICY "Service role full access to audit_logs" 
        ON audit_logs FOR ALL 
        TO service_role 
        USING (true)
        WITH CHECK (true);
        
        RAISE NOTICE 'RLS enabled on audit_logs';
    ELSE
        RAISE NOTICE 'audit_logs table does not exist, skipping';
    END IF;
END $$;

-- =====================================================
-- 20. ADMIN ACTIVITY LOGS (if exists)
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
    ELSE
        RAISE NOTICE 'admin_activity_logs table does not exist, skipping';
    END IF;
END $$;

-- =====================================================
-- 21. AGENCY DEVICES (if exists)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agency_devices') THEN
        ALTER TABLE agency_devices ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "Agencies can manage their devices" ON agency_devices;
        DROP POLICY IF EXISTS "Service role full access to agency_devices" ON agency_devices;
        
        CREATE POLICY "Agencies can manage their devices" 
        ON agency_devices FOR ALL 
        TO authenticated 
        USING (agency_id::text = auth.uid()::text)
        WITH CHECK (agency_id::text = auth.uid()::text);

        CREATE POLICY "Service role full access to agency_devices" 
        ON agency_devices FOR ALL 
        TO service_role 
        USING (true)
        WITH CHECK (true);
        
        RAISE NOTICE 'RLS enabled on agency_devices';
    ELSE
        RAISE NOTICE 'agency_devices table does not exist, skipping';
    END IF;
END $$;

-- =====================================================
-- 22. NOTIFICATION SETTINGS (if exists)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_settings') THEN
        ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "Agencies can manage their settings" ON notification_settings;
        DROP POLICY IF EXISTS "Service role full access to notification_settings" ON notification_settings;
        
        CREATE POLICY "Agencies can manage their settings" 
        ON notification_settings FOR ALL 
        TO authenticated 
        USING (agency_id::text = auth.uid()::text)
        WITH CHECK (agency_id::text = auth.uid()::text);

        CREATE POLICY "Service role full access to notification_settings" 
        ON notification_settings FOR ALL 
        TO service_role 
        USING (true)
        WITH CHECK (true);
        
        RAISE NOTICE 'RLS enabled on notification_settings';
    ELSE
        RAISE NOTICE 'notification_settings table does not exist, skipping';
    END IF;
END $$;

-- =====================================================
-- 23. NOTIFICATIONS (if exists)
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
        USING (agency_id::text = auth.uid()::text)
        WITH CHECK (agency_id::text = auth.uid()::text);

        CREATE POLICY "Service role full access to notifications" 
        ON notifications FOR ALL 
        TO service_role 
        USING (true)
        WITH CHECK (true);
        
        RAISE NOTICE 'RLS enabled on notifications';
    ELSE
        RAISE NOTICE 'notifications table does not exist, skipping';
    END IF;
END $$;

-- =====================================================
-- 24. VERIFICATION DOCUMENTS (if exists)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'verification_documents') THEN
        ALTER TABLE verification_documents ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "Agencies can view their documents" ON verification_documents;
        DROP POLICY IF EXISTS "Agencies can upload documents" ON verification_documents;
        DROP POLICY IF EXISTS "Service role full access to verification_documents" ON verification_documents;
        
        CREATE POLICY "Agencies can view their documents" 
        ON verification_documents FOR SELECT 
        TO authenticated 
        USING (
          agency_id::text = auth.uid()::text 
          OR auth.role() = 'service_role'
        );

        CREATE POLICY "Agencies can upload documents" 
        ON verification_documents FOR INSERT 
        TO authenticated 
        WITH CHECK (agency_id::text = auth.uid()::text);

        CREATE POLICY "Service role full access to verification_documents" 
        ON verification_documents FOR ALL 
        TO service_role 
        USING (true)
        WITH CHECK (true);
        
        RAISE NOTICE 'RLS enabled on verification_documents';
    ELSE
        RAISE NOTICE 'verification_documents table does not exist, skipping';
    END IF;
END $$;

-- =====================================================
-- 25. SYSTEM SETTINGS (if exists)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_settings') THEN
        ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "Allow read access for authenticated users" ON system_settings;
        DROP POLICY IF EXISTS "Allow admin write access" ON system_settings;
        DROP POLICY IF EXISTS "Service role full access to system_settings" ON system_settings;
        
        CREATE POLICY "Allow read access for authenticated users" 
        ON system_settings FOR SELECT 
        TO authenticated 
        USING (true);

        CREATE POLICY "Allow admin write access" 
        ON system_settings FOR ALL 
        TO authenticated 
        USING (
          EXISTS (
            SELECT 1 FROM users 
            WHERE users.id::text = auth.uid()::text 
            AND users.role IN ('super_admin', 'admin')
          )
        );

        CREATE POLICY "Service role full access to system_settings" 
        ON system_settings FOR ALL 
        TO service_role 
        USING (true)
        WITH CHECK (true);
        
        RAISE NOTICE 'RLS enabled on system_settings';
    ELSE
        RAISE NOTICE 'system_settings table does not exist, skipping';
    END IF;
END $$;

-- =====================================================
-- 26. ROUND ROBIN STATE (if exists)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'round_robin_state') THEN
        ALTER TABLE round_robin_state ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "Allow service role only" ON round_robin_state;
        
        CREATE POLICY "Allow service role only" 
        ON round_robin_state FOR ALL 
        TO service_role 
        USING (true)
        WITH CHECK (true);
        
        RAISE NOTICE 'RLS enabled on round_robin_state';
    ELSE
        RAISE NOTICE 'round_robin_state table does not exist, skipping';
    END IF;
END $$;

-- =====================================================
-- 27. AGENCY SUBSCRIPTIONS (if exists)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agency_subscriptions') THEN
        ALTER TABLE agency_subscriptions ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "Agencies can view their subscriptions" ON agency_subscriptions;
        DROP POLICY IF EXISTS "Service role full access to agency_subscriptions" ON agency_subscriptions;
        
        CREATE POLICY "Agencies can view their subscriptions" 
        ON agency_subscriptions FOR SELECT 
        TO authenticated 
        USING (
          agency_id::text = auth.uid()::text 
          OR auth.role() = 'service_role'
        );

        CREATE POLICY "Service role full access to agency_subscriptions" 
        ON agency_subscriptions FOR ALL 
        TO service_role 
        USING (true)
        WITH CHECK (true);
        
        RAISE NOTICE 'RLS enabled on agency_subscriptions';
    ELSE
        RAISE NOTICE 'agency_subscriptions table does not exist, skipping';
    END IF;
END $$;

COMMIT;

-- =====================================================
-- VERIFICATION
-- =====================================================
-- Check which tables have RLS enabled
DO $$
DECLARE
    r record;
BEGIN
    RAISE NOTICE 'RLS Status Check:';
    FOR r IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY tablename
    LOOP
        RAISE NOTICE 'Table: %', r.tablename;
    END LOOP;
END $$;

