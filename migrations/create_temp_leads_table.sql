-- Create temp_leads table to store all public portal form data
-- This table matches exactly what the public portal sends

CREATE TABLE IF NOT EXISTS temp_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Portal identification
    portal_code VARCHAR(255),
    portal_id UUID REFERENCES portals(id),
    
    -- Public portal form fields (use snake_case - PostgreSQL converts to lowercase)
    service_type VARCHAR(50),
    urgency VARCHAR(50),
    age_range VARCHAR(10),
    care_need VARCHAR(255),
    zip_code VARCHAR(10),
    contact VARCHAR(255), -- Can be phone or email
    source VARCHAR(255),
    consent BOOLEAN,
    
    -- Standard contact fields
    email VARCHAR(255),
    phone VARCHAR(20),
    phone_number VARCHAR(20),
    
    -- Additional fields that might be sent
    campaign VARCHAR(100),
    medium VARCHAR(50),
    
    -- Lead name (generated or provided)
    lead_name VARCHAR(255),
    name VARCHAR(255),
    
    -- Raw payload stored as JSONB
    raw_payload JSONB,
    
    -- Timestamps
    submitted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_temp_leads_portal_code ON temp_leads(portal_code);
CREATE INDEX IF NOT EXISTS idx_temp_leads_portal_id ON temp_leads(portal_id);
CREATE INDEX IF NOT EXISTS idx_temp_leads_created_at ON temp_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_temp_leads_email ON temp_leads(email);
CREATE INDEX IF NOT EXISTS idx_temp_leads_phone ON temp_leads(phone);

-- Add comment
COMMENT ON TABLE temp_leads IS 'Temporary table to store all public portal form submissions with all fields preserved';

