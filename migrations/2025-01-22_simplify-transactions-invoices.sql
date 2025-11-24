-- Migration: Simplify Transactions and Invoices Tables
-- Date: 2025-01-22
-- Description: Simplifies transactions and invoices tables to only include required fields
-- Removes refund-related functionality

-- =====================================================
-- 1. SIMPLIFY TRANSACTIONS TABLE
-- =====================================================

-- First, drop indexes that reference columns we'll remove
DROP INDEX IF EXISTS idx_transactions_reference_id;
DROP INDEX IF EXISTS idx_transactions_payment_reference;

-- Remove refund-related data: delete all refund transactions
DELETE FROM transactions WHERE transaction_type = 'refund';

-- Remove refund from transaction_type enum by recreating the constraint
-- First, update any remaining 'refund' types to 'adjustment' (safety measure)
UPDATE transactions SET transaction_type = 'adjustment' WHERE transaction_type = 'refund';

-- Drop the old check constraint
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_transaction_type_check;

-- Add new check constraint without 'refund'
ALTER TABLE transactions ADD CONSTRAINT transactions_transaction_type_check 
  CHECK (transaction_type IN ('credit_purchase', 'lead_purchase', 'subscription_payment', 'adjustment'));

-- Remove 'refunded' from status enum
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_status_check 
  CHECK (status IN ('pending', 'completed', 'failed'));

-- Drop columns that are not in the required list
ALTER TABLE transactions DROP COLUMN IF EXISTS description;
ALTER TABLE transactions DROP COLUMN IF EXISTS reference_id;
ALTER TABLE transactions DROP COLUMN IF EXISTS reference_type;
ALTER TABLE transactions DROP COLUMN IF EXISTS payment_method;
ALTER TABLE transactions DROP COLUMN IF EXISTS payment_reference;
ALTER TABLE transactions DROP COLUMN IF EXISTS processed_at;
ALTER TABLE transactions DROP COLUMN IF EXISTS failure_reason;
ALTER TABLE transactions DROP COLUMN IF EXISTS updated_at;

-- Rename columns to match requirements
-- id stays as id (will be used as transaction_id in API)
-- agency_id stays as agency_id
-- transaction_type will be used as 'type' in API
-- amount stays as amount
-- status stays as status
-- created_at will be used as 'date' in API

-- Recreate necessary indexes
CREATE INDEX IF NOT EXISTS idx_transactions_agency_id ON transactions(agency_id);
CREATE INDEX IF NOT EXISTS idx_transactions_transaction_type ON transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);

-- =====================================================
-- 2. CREATE/MODIFY INVOICES TABLE
-- =====================================================

-- Drop any views that depend on columns we're removing
DROP VIEW IF EXISTS invoice_summary CASCADE;
DROP VIEW IF EXISTS v_invoice_summary CASCADE;

-- Create invoices table if it doesn't exist, or modify if it does
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),
    due_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- If table already exists, drop extra columns
DO $$
BEGIN
    -- Drop columns that are not in the required list
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'subscription_id') THEN
        ALTER TABLE invoices DROP COLUMN subscription_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'invoice_number') THEN
        ALTER TABLE invoices DROP COLUMN invoice_number;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'description') THEN
        ALTER TABLE invoices DROP COLUMN description;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'line_items') THEN
        ALTER TABLE invoices DROP COLUMN line_items;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'amount_due') THEN
        ALTER TABLE invoices DROP COLUMN amount_due;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'total_amount') THEN
        ALTER TABLE invoices DROP COLUMN total_amount;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'paid_at') THEN
        ALTER TABLE invoices DROP COLUMN paid_at;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'updated_at') THEN
        ALTER TABLE invoices DROP COLUMN updated_at;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'metadata') THEN
        ALTER TABLE invoices DROP COLUMN metadata;
    END IF;
    
    -- Ensure required columns exist with correct constraints
    -- Note: If table already exists, id column should already exist as primary key
    -- We only add it if the table is being created fresh
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'id') THEN
        ALTER TABLE invoices ADD COLUMN id UUID DEFAULT gen_random_uuid();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'agency_id') THEN
        ALTER TABLE invoices ADD COLUMN agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE;
        -- Update NULL values if any exist, then add NOT NULL constraint
        UPDATE invoices SET agency_id = (SELECT id FROM agencies LIMIT 1) WHERE agency_id IS NULL;
        ALTER TABLE invoices ALTER COLUMN agency_id SET NOT NULL;
    END IF;
    
    -- Handle amount column: add if doesn't exist, or fix NULL values if it does
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'amount') THEN
        -- Add column as nullable first
        ALTER TABLE invoices ADD COLUMN amount DECIMAL(10, 2);
        -- Set default value for any existing rows
        UPDATE invoices SET amount = 0 WHERE amount IS NULL;
        -- Now add NOT NULL constraint and check constraint
        ALTER TABLE invoices ALTER COLUMN amount SET NOT NULL;
        ALTER TABLE invoices ADD CONSTRAINT invoices_amount_check CHECK (amount >= 0);
    ELSE
        -- Column exists, but might have NULL values - fix them
        UPDATE invoices SET amount = COALESCE(amount, 0) WHERE amount IS NULL;
        -- Ensure NOT NULL constraint exists
        ALTER TABLE invoices ALTER COLUMN amount SET NOT NULL;
        -- Ensure check constraint exists
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name = 'invoices' AND constraint_name = 'invoices_amount_check'
        ) THEN
            ALTER TABLE invoices ADD CONSTRAINT invoices_amount_check CHECK (amount >= 0);
        END IF;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'due_date') THEN
        ALTER TABLE invoices ADD COLUMN due_date TIMESTAMP WITH TIME ZONE;
        -- Set default value for any existing rows
        UPDATE invoices SET due_date = COALESCE(created_at, NOW()) WHERE due_date IS NULL;
        ALTER TABLE invoices ALTER COLUMN due_date SET NOT NULL;
    ELSE
        -- Column exists, fix NULL values
        UPDATE invoices SET due_date = COALESCE(due_date, COALESCE(created_at, NOW())) WHERE due_date IS NULL;
        ALTER TABLE invoices ALTER COLUMN due_date SET NOT NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'status') THEN
        ALTER TABLE invoices ADD COLUMN status VARCHAR(20) DEFAULT 'pending';
        -- Update NULL values
        UPDATE invoices SET status = 'pending' WHERE status IS NULL;
        ALTER TABLE invoices ALTER COLUMN status SET NOT NULL;
        ALTER TABLE invoices ADD CONSTRAINT invoices_status_check CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled'));
    ELSE
        -- Column exists, fix NULL values
        UPDATE invoices SET status = COALESCE(status, 'pending') WHERE status IS NULL;
        ALTER TABLE invoices ALTER COLUMN status SET NOT NULL;
        -- Ensure check constraint exists
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name = 'invoices' AND constraint_name = 'invoices_status_check'
        ) THEN
            ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
            ALTER TABLE invoices ADD CONSTRAINT invoices_status_check CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled'));
        END IF;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'created_at') THEN
        ALTER TABLE invoices ADD COLUMN created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
    END IF;
    
    -- Update status constraint if it exists
    ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
    ALTER TABLE invoices ADD CONSTRAINT invoices_status_check 
      CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled'));
END $$;

-- Create indexes for invoices
CREATE INDEX IF NOT EXISTS idx_invoices_agency_id ON invoices(agency_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at);

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE transactions IS 'Simplified transactions table with only essential fields: id, agency_id, amount, type, status, date';
COMMENT ON TABLE invoices IS 'Simplified invoices table with only essential fields: id, agency_id, amount, due_date, status';

