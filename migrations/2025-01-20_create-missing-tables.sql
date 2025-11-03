-- Migration: Create Missing Tables for Full API Implementation
-- Date: 2025-01-20
-- Description: Creates tables needed for lead management, notifications, devices, and document verification

-- =====================================================
-- 1. NOTIFICATION SETTINGS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS notification_settings (
    id SERIAL PRIMARY KEY,
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    push_enabled BOOLEAN DEFAULT TRUE,
    email_enabled BOOLEAN DEFAULT TRUE,
    sms_enabled BOOLEAN DEFAULT FALSE,
    sound_enabled BOOLEAN DEFAULT TRUE,
    vibration_enabled BOOLEAN DEFAULT TRUE,
    quiet_hours JSONB, -- {"start": "22:00", "end": "08:00"}
    notification_types TEXT[] DEFAULT ARRAY['lead_assigned', 'subscription_expiring'],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(agency_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_settings_agency_id ON notification_settings(agency_id);

-- =====================================================
-- 2. LEAD NOTES TABLE (Recommended for History)
-- =====================================================
CREATE TABLE IF NOT EXISTS lead_notes (
    id SERIAL PRIMARY KEY,
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    note_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id UUID REFERENCES users(id),
    CONSTRAINT unique_lead_note UNIQUE (lead_id, agency_id, created_at)
);

CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_id ON lead_notes(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_notes_agency_id ON lead_notes(agency_id);
CREATE INDEX IF NOT EXISTS idx_lead_notes_created_at ON lead_notes(created_at DESC);

-- =====================================================
-- 3. LEAD INTERACTIONS TABLE (Call/Email Tracking)
-- =====================================================
CREATE TABLE IF NOT EXISTS lead_interactions (
    id SERIAL PRIMARY KEY,
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    interaction_type VARCHAR(50) NOT NULL, -- phone_call, email, sms, note, status_change
    interaction_data JSONB, -- {"duration_seconds": 120, "outcome": "answered"}
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lead_interactions_lead_id ON lead_interactions(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_interactions_agency_id ON lead_interactions(agency_id);
CREATE INDEX IF NOT EXISTS idx_lead_interactions_type ON lead_interactions(interaction_type);
CREATE INDEX IF NOT EXISTS idx_lead_interactions_created_at ON lead_interactions(created_at DESC);

-- =====================================================
-- 4. LEAD STATUS HISTORY TABLE (Optional Audit Trail)
-- =====================================================
CREATE TABLE IF NOT EXISTS lead_status_history (
    id SERIAL PRIMARY KEY,
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    previous_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    changed_by_agency_id UUID REFERENCES agencies(id),
    notes TEXT,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lead_status_history_lead_id ON lead_status_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_status_history_changed_at ON lead_status_history(changed_at DESC);

-- =====================================================
-- 5. LEAD VIEWS TABLE (Analytics Tracking)
-- =====================================================
CREATE TABLE IF NOT EXISTS lead_views (
    id SERIAL PRIMARY KEY,
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- One view per day per agency per lead
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_views_unique 
ON lead_views(lead_id, agency_id, DATE(viewed_at));

CREATE INDEX IF NOT EXISTS idx_lead_views_lead_id ON lead_views(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_views_agency_id ON lead_views(agency_id);

-- =====================================================
-- 6. PASSWORD RESET TOKENS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    token VARCHAR(64) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_agency_id ON password_reset_tokens(agency_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);

-- =====================================================
-- 7. VERIFICATION DOCUMENTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS verification_documents (
    id SERIAL PRIMARY KEY,
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    document_type VARCHAR(50) NOT NULL, -- business_license, certificate, tax_id, other
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL, -- Storage path (S3, local, etc.)
    file_size INTEGER NOT NULL, -- Size in bytes
    mime_type VARCHAR(100), -- application/pdf, image/png, image/jpeg
    description TEXT,
    verification_status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected
    reviewed_by UUID REFERENCES users(id), -- Admin user who reviewed
    reviewed_at TIMESTAMP,
    rejection_reason TEXT, -- If rejected, why
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_verification_documents_agency_id ON verification_documents(agency_id);
CREATE INDEX IF NOT EXISTS idx_verification_documents_status ON verification_documents(verification_status);
CREATE INDEX IF NOT EXISTS idx_verification_documents_agency_status ON verification_documents(agency_id, verification_status);

-- =====================================================
-- 8. ENSURE AGENCY_DEVICES TABLE EXISTS (if not already)
-- =====================================================
CREATE TABLE IF NOT EXISTS agency_devices (
    id SERIAL PRIMARY KEY,
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    device_token VARCHAR(500) NOT NULL,
    platform VARCHAR(50) NOT NULL, -- ios, android
    device_model VARCHAR(255),
    app_version VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(agency_id, device_token)
);

CREATE INDEX IF NOT EXISTS idx_agency_devices_agency_id ON agency_devices(agency_id);
CREATE INDEX IF NOT EXISTS idx_agency_devices_token ON agency_devices(device_token);
CREATE INDEX IF NOT EXISTS idx_agency_devices_active ON agency_devices(agency_id, is_active);

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE notification_settings IS 'User notification preferences for agencies';
COMMENT ON TABLE lead_notes IS 'Notes/comments added to leads by agencies';
COMMENT ON TABLE lead_interactions IS 'Call/email/SMS interactions with leads';
COMMENT ON TABLE lead_status_history IS 'Audit trail of lead status changes';
COMMENT ON TABLE lead_views IS 'Analytics tracking for lead views (one per day)';
COMMENT ON TABLE password_reset_tokens IS 'Secure password reset tokens with expiration';
COMMENT ON TABLE verification_documents IS 'Company verification documents uploaded by agencies';
COMMENT ON TABLE agency_devices IS 'Mobile devices registered for push notifications';

