-- Migration: Create Supporting Tables for Email Queue and Analytics
-- Date: 2025-01-21
-- Description: Creates tables for email queue and analytics events

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. EMAIL_QUEUE TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS email_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    to_email VARCHAR(255) NOT NULL,
    from_email VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    body TEXT NOT NULL,
    html_body TEXT,
    email_type VARCHAR(50), -- 'password_reset', 'cancellation', 'welcome', etc.
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
    provider VARCHAR(50), -- 'sendgrid', 'nodemailer', 'ses'
    retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    error_message TEXT,
    sent_at TIMESTAMP WITH TIME ZONE,
    processed_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status);
CREATE INDEX IF NOT EXISTS idx_email_queue_created_at ON email_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_email_queue_email_type ON email_queue(email_type);
CREATE INDEX IF NOT EXISTS idx_email_queue_to_email ON email_queue(to_email);

-- =====================================================
-- 2. ANALYTICS_EVENTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL, -- 'lead_viewed', 'lead_accepted', 'subscription_created', etc.
    event_name VARCHAR(100) NOT NULL,
    event_data JSONB DEFAULT '{}',
    device_info TEXT,
    ip_address VARCHAR(45),
    session_id VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_agency_id ON analytics_events(agency_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_name ON analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON analytics_events(user_id);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_analytics_events_agency_type_date ON analytics_events(agency_id, event_type, created_at DESC);

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE email_queue IS 'Queue for emails when provider is not configured or unavailable';
COMMENT ON TABLE analytics_events IS 'Stores mobile app analytics events for tracking and reporting';


