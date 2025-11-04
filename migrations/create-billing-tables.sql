-- Create Billing History Table
-- This migration creates the billing_history table for tracking payment transactions

CREATE TABLE IF NOT EXISTS billing_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    billing_date TIMESTAMP WITH TIME ZONE NOT NULL,
    due_date TIMESTAMP WITH TIME ZONE NOT NULL,
    amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD' CHECK (LENGTH(currency) = 3),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED')),
    payment_method VARCHAR(20) CHECK (payment_method IN ('CREDIT_CARD', 'BANK_TRANSFER', 'DEBIT_CARD', 'PAYPAL', 'STRIPE', 'MANUAL')),
    payment_reference VARCHAR(255),
    transaction_id VARCHAR(255),
    failure_reason TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    next_retry_date TIMESTAMP WITH TIME ZONE,
    billing_period VARCHAR(50) NOT NULL,
    units_used INTEGER NOT NULL DEFAULT 0 CHECK (units_used >= 0),
    unit_price DECIMAL(10,4) NOT NULL CHECK (unit_price >= 0),
    base_amount DECIMAL(10,2) NOT NULL CHECK (base_amount >= 0),
    additional_amount DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (additional_amount >= 0),
    discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
    notes TEXT,
    metadata JSONB,
    processed_at TIMESTAMP WITH TIME ZONE,
    processed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_billing_history_agency_id ON billing_history(agency_id);
CREATE INDEX IF NOT EXISTS idx_billing_history_subscription_id ON billing_history(subscription_id);
CREATE INDEX IF NOT EXISTS idx_billing_history_billing_date ON billing_history(billing_date);
CREATE INDEX IF NOT EXISTS idx_billing_history_status ON billing_history(status);
CREATE INDEX IF NOT EXISTS idx_billing_history_payment_method ON billing_history(payment_method);
CREATE INDEX IF NOT EXISTS idx_billing_history_billing_date_status ON billing_history(billing_date, status);
CREATE INDEX IF NOT EXISTS idx_billing_history_agency_billing_date ON billing_history(agency_id, billing_date);
CREATE INDEX IF NOT EXISTS idx_billing_history_due_date ON billing_history(due_date);
CREATE INDEX IF NOT EXISTS idx_billing_history_created_at ON billing_history(created_at);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_billing_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER trigger_update_billing_history_updated_at
    BEFORE UPDATE ON billing_history
    FOR EACH ROW
    EXECUTE FUNCTION update_billing_history_updated_at();

-- Add comments for documentation
COMMENT ON TABLE billing_history IS 'Stores billing and payment history for agency subscriptions';
COMMENT ON COLUMN billing_history.id IS 'Unique identifier for billing record';
COMMENT ON COLUMN billing_history.agency_id IS 'Reference to the agency being billed';
COMMENT ON COLUMN billing_history.subscription_id IS 'Reference to the subscription being billed';
COMMENT ON COLUMN billing_history.plan_id IS 'Reference to the subscription plan';
COMMENT ON COLUMN billing_history.billing_date IS 'Date when the billing was generated';
COMMENT ON COLUMN billing_history.due_date IS 'Date when payment is due';
COMMENT ON COLUMN billing_history.amount IS 'Base billing amount before taxes and discounts';
COMMENT ON COLUMN billing_history.total_amount IS 'Final amount including taxes and discounts';
COMMENT ON COLUMN billing_history.status IS 'Current status of the payment';
COMMENT ON COLUMN billing_history.payment_method IS 'Method used for payment';
COMMENT ON COLUMN billing_history.units_used IS 'Number of territory units used in billing period';
COMMENT ON COLUMN billing_history.retry_count IS 'Number of times payment retry has been attempted';
COMMENT ON COLUMN billing_history.next_retry_date IS 'Next scheduled retry date for failed payments';
COMMENT ON COLUMN billing_history.processed_at IS 'Timestamp when payment was processed';
COMMENT ON COLUMN billing_history.processed_by IS 'User who processed the payment';

-- Insert sample data for testing (optional - remove in production)
INSERT INTO billing_history (
    agency_id,
    subscription_id,
    plan_id,
    billing_date,
    due_date,
    amount,
    total_amount,
    status,
    payment_method,
    billing_period,
    units_used,
    unit_price,
    base_amount
) VALUES (
    (SELECT id FROM agencies LIMIT 1),
    (SELECT id FROM subscriptions LIMIT 1),
    (SELECT id FROM subscription_plans LIMIT 1),
    NOW() - INTERVAL '30 days',
    NOW() - INTERVAL '25 days',
    299.99,
    299.99,
    'COMPLETED',
    'CREDIT_CARD',
    '2024-01',
    5,
    59.99,
    299.99
) ON CONFLICT DO NOTHING;
