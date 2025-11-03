-- Fixed SQL Query to Verify RLS Status
-- This query correctly checks RLS status without subquery errors

SELECT 
    t.tablename,
    CASE 
        WHEN c.relrowsecurity = true
        THEN '✅ RLS Enabled' 
        ELSE '❌ RLS Disabled' 
    END as rls_status,
    COALESCE(p.policy_count, 0) as policy_count
FROM pg_tables t
LEFT JOIN pg_class c ON c.relname = t.tablename 
    AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
LEFT JOIN (
    SELECT tablename, COUNT(*) as policy_count
    FROM pg_policies 
    WHERE schemaname = 'public'
    GROUP BY tablename
) p ON p.tablename = t.tablename
WHERE t.schemaname = 'public'
ORDER BY t.tablename;

