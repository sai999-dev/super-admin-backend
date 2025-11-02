-- Refresh PostgREST schema cache so new columns are visible to API
-- Date: 2025-11-01

BEGIN;

-- Notify PostgREST to reload schema (works with Supabase PostgREST)
SELECT pg_notify('pgrst', 'reload schema');
-- Some environments accept direct NOTIFY as well
NOTIFY pgrst, 'reload schema';

COMMIT;
