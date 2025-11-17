# Fix audit_logs Table - Add created_at and updated_at Columns

## Problem
The mobile API is failing with error:
```
column audit_logs.created_at does not exist
```

The `audit_logs` table currently has `time_stamp` but the backend code expects `created_at` and `updated_at`.

## Solution
Run the migration SQL to add the missing columns.

## How to Apply the Fix

### Option 1: Supabase SQL Editor (Recommended)

1. **Open Supabase Dashboard**
   - Go to your Supabase project: https://supabase.com/dashboard
   - Select your project

2. **Navigate to SQL Editor**
   - Click on "SQL Editor" in the left sidebar
   - Click "New Query"

3. **Copy and Paste the Migration**
   - Open: `migrations/2025-11-17_add-created-at-to-audit-logs.sql`
   - Copy the entire contents
   - Paste into the SQL Editor

4. **Run the Migration**
   - Click "Run" button (or press Ctrl+Enter)
   - Wait for success message

5. **Verify**
   - Run this verification query:
   ```sql
   SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_name = 'audit_logs'
   AND column_name IN ('created_at', 'updated_at', 'time_stamp');
   ```
   - You should see all three columns listed

### Option 2: Quick Manual Fix (Alternative)

If you prefer, you can run these commands directly:

```sql
-- Add created_at column
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Copy time_stamp to created_at for existing records
UPDATE audit_logs SET created_at = time_stamp WHERE created_at IS NULL;

-- Add updated_at column
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Copy time_stamp to updated_at for existing records
UPDATE audit_logs SET updated_at = time_stamp WHERE updated_at IS NULL;

-- Create trigger for auto-updating updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_audit_logs_updated_at ON audit_logs;

CREATE TRIGGER update_audit_logs_updated_at
    BEFORE UPDATE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_agency_created ON audit_logs(agency_id, created_at DESC);
```

## What This Migration Does

1. **Adds `created_at` column** - Timestamp when the audit log entry was created
2. **Adds `updated_at` column** - Timestamp when the audit log entry was last updated
3. **Copies data** - Copies existing `time_stamp` values to `created_at` and `updated_at`
4. **Creates trigger** - Automatically updates `updated_at` on every row update
5. **Adds indexes** - Improves query performance for ORDER BY created_at

## After Running the Migration

1. **Restart your backend server** (if it's running)
2. **Test the mobile API**:
   ```bash
   # From the backend directory
   node scripts/check-audit-logs-schema.js
   ```
   You should now see `created_at` and `updated_at` in the column list

3. **Test the Flutter app**:
   - The communicate button should now work
   - Leads should display in the dashboard
   - No more 500 errors about missing columns

## Rollback (If Needed)

If something goes wrong, you can rollback:

```sql
-- Remove the columns
ALTER TABLE audit_logs DROP COLUMN IF EXISTS created_at;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS updated_at;

-- Remove the trigger
DROP TRIGGER IF EXISTS update_audit_logs_updated_at ON audit_logs;
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Remove the indexes
DROP INDEX IF EXISTS idx_audit_logs_created_at;
DROP INDEX IF EXISTS idx_audit_logs_agency_created;
```

## Notes

- The `time_stamp` column is kept for backward compatibility
- New records will have all three columns populated
- The trigger ensures `updated_at` is always current
- Indexes improve query performance significantly
