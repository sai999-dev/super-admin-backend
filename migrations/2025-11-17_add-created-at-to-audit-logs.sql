-- Migration: Add created_at and updated_at columns to audit_logs table
-- Date: 2025-11-17
-- Description: Fixes the "column audit_logs.created_at does not exist" error

-- Add created_at column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'audit_logs' AND column_name = 'created_at'
    ) THEN
        ALTER TABLE audit_logs ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();

        -- Copy existing time_stamp values to created_at
        UPDATE audit_logs SET created_at = time_stamp WHERE time_stamp IS NOT NULL;

        -- Make it NOT NULL after setting values
        ALTER TABLE audit_logs ALTER COLUMN created_at SET NOT NULL;
    END IF;
END $$;

-- Add updated_at column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'audit_logs' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE audit_logs ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();

        -- Copy existing time_stamp values to updated_at
        UPDATE audit_logs SET updated_at = time_stamp WHERE time_stamp IS NOT NULL;

        -- Make it NOT NULL after setting values
        ALTER TABLE audit_logs ALTER COLUMN updated_at SET NOT NULL;
    END IF;
END $$;

-- Create or replace trigger to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop trigger if exists
DROP TRIGGER IF EXISTS update_audit_logs_updated_at ON audit_logs;

-- Create trigger
CREATE TRIGGER update_audit_logs_updated_at
    BEFORE UPDATE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create index on created_at for better query performance (used in ORDER BY)
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_agency_created ON audit_logs(agency_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_lead_created ON audit_logs(lead_id, created_at DESC);

COMMENT ON COLUMN audit_logs.created_at IS 'Timestamp when the audit log entry was created';
COMMENT ON COLUMN audit_logs.updated_at IS 'Timestamp when the audit log entry was last updated';
