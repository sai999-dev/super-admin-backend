-- Migration: Create Remaining Missing Tables
-- Date: 2025-01-21
-- Description: Creates all missing tables identified in database verification

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. BILLING_HISTORY TABLE
-- =====================================================
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

CREATE INDEX IF NOT EXISTS idx_billing_history_agency_id ON billing_history(agency_id);
CREATE INDEX IF NOT EXISTS idx_billing_history_subscription_id ON billing_history(subscription_id);
CREATE INDEX IF NOT EXISTS idx_billing_history_billing_date ON billing_history(billing_date);
CREATE INDEX IF NOT EXISTS idx_billing_history_status ON billing_history(status);
CREATE INDEX IF NOT EXISTS idx_billing_history_payment_method ON billing_history(payment_method);
CREATE INDEX IF NOT EXISTS idx_billing_history_billing_date_status ON billing_history(billing_date, status);
CREATE INDEX IF NOT EXISTS idx_billing_history_agency_billing_date ON billing_history(agency_id, billing_date);
CREATE INDEX IF NOT EXISTS idx_billing_history_due_date ON billing_history(due_date);
CREATE INDEX IF NOT EXISTS idx_billing_history_created_at ON billing_history(created_at);

-- =====================================================
-- 2. TRANSACTIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN ('credit_purchase', 'lead_purchase', 'refund', 'subscription_payment', 'adjustment')),
    amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    description TEXT,
    reference_id UUID,
    reference_type VARCHAR(50),
    payment_method VARCHAR(50),
    payment_reference VARCHAR(255),
    processed_at TIMESTAMP WITH TIME ZONE,
    failure_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_agency_id ON transactions(agency_id);
CREATE INDEX IF NOT EXISTS idx_transactions_transaction_type ON transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_reference_id ON transactions(reference_id);
CREATE INDEX IF NOT EXISTS idx_transactions_payment_reference ON transactions(payment_reference);

-- =====================================================
-- 3. NOTIFICATIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL CHECK (notification_type IN ('lead_available', 'purchase_confirmed', 'credit_low', 'subscription_expiring', 'system')),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_agency_id ON notifications(agency_id);
CREATE INDEX IF NOT EXISTS idx_notifications_notification_type ON notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON notifications(priority);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_expires_at ON notifications(expires_at);

-- =====================================================
-- 4. PUSH_NOTIFICATIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS push_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    mobile_subscription_id UUID,
    notification_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE,
    delivery_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'delivered', 'failed')),
    delivery_response JSONB,
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_notifications_agency_id ON push_notifications(agency_id);
CREATE INDEX IF NOT EXISTS idx_push_notifications_delivery_status ON push_notifications(delivery_status);
CREATE INDEX IF NOT EXISTS idx_push_notifications_scheduled_for ON push_notifications(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_push_notifications_notification_type ON push_notifications(notification_type);

-- =====================================================
-- 5. ADMIN_ACTIVITY_LOGS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS admin_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL,
    admin_email VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100) NOT NULL,
    resource_id UUID,
    details JSONB DEFAULT '{}',
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_admin_id ON admin_activity_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_action ON admin_activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_resource ON admin_activity_logs(resource);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_created_at ON admin_activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_resource_id ON admin_activity_logs(resource_id);

-- =====================================================
-- 6. WEBHOOK_AUDIT TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS webhook_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    portal_id UUID REFERENCES portals(id) ON DELETE SET NULL,
    api_key_id UUID,
    raw_payload JSONB NOT NULL,
    headers JSONB,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed', 'retry')),
    error_message TEXT,
    processing_time_ms INTEGER,
    received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_audit_portal_id ON webhook_audit(portal_id);
CREATE INDEX IF NOT EXISTS idx_webhook_audit_received_at ON webhook_audit(received_at);
CREATE INDEX IF NOT EXISTS idx_webhook_audit_status ON webhook_audit(status);
CREATE INDEX IF NOT EXISTS idx_webhook_audit_lead_id ON webhook_audit(lead_id);

-- =====================================================
-- 7. LEAD_PURCHASES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS lead_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    purchase_price DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'completed', 'cancelled', 'refunded')),
    reserved_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    reserved_until TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    first_viewed_at TIMESTAMP WITH TIME ZONE,
    last_viewed_at TIMESTAMP WITH TIME ZONE,
    view_count INTEGER NOT NULL DEFAULT 0,
    refund_requested_at TIMESTAMP WITH TIME ZONE,
    refund_reason TEXT,
    refund_approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_purchases_lead_id ON lead_purchases(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_purchases_agency_id ON lead_purchases(agency_id);
CREATE INDEX IF NOT EXISTS idx_lead_purchases_status ON lead_purchases(status);
CREATE INDEX IF NOT EXISTS idx_lead_purchases_reserved_at ON lead_purchases(reserved_at);
CREATE INDEX IF NOT EXISTS idx_lead_purchases_reserved_until ON lead_purchases(reserved_until);
CREATE INDEX IF NOT EXISTS idx_lead_purchases_completed_at ON lead_purchases(completed_at);

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE billing_history IS 'Stores billing and payment history for agency subscriptions';
COMMENT ON TABLE transactions IS 'Tracks all financial transactions for agencies';
COMMENT ON TABLE notifications IS 'In-app notifications for agencies';
COMMENT ON TABLE push_notifications IS 'Push notification queue and delivery tracking';
COMMENT ON TABLE admin_activity_logs IS 'Audit trail for all super admin actions';
COMMENT ON TABLE webhook_audit IS 'Audit log for webhook requests and responses';
COMMENT ON TABLE lead_purchases IS 'Tracks lead purchase transactions and status';

