-- Create unified leads table that can handle different schemas from multiple portals
-- This table normalizes data from different portals into common fields
-- All unmatched fields are stored in extra_fields JSONB column

CREATE TABLE IF NOT EXISTS unified_leads (
  id SERIAL PRIMARY KEY,
  portal_id VARCHAR(50) NOT NULL,
  portal_code VARCHAR(255),
  
  -- Common normalized fields (extracted from different portal schemas)
  name VARCHAR(255),
  phone VARCHAR(20),
  email VARCHAR(255),
  
  -- Additional common fields that might be useful
  city VARCHAR(100),
  state VARCHAR(50),
  zipcode VARCHAR(10),
  country VARCHAR(100),
  
  -- All unmatched/extra fields stored as JSONB
  extra_fields JSONB DEFAULT '{}',
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for common query fields
CREATE INDEX IF NOT EXISTS idx_unified_leads_portal_id ON unified_leads(portal_id);
CREATE INDEX IF NOT EXISTS idx_unified_leads_portal_code ON unified_leads(portal_code);
CREATE INDEX IF NOT EXISTS idx_unified_leads_name ON unified_leads(name);
CREATE INDEX IF NOT EXISTS idx_unified_leads_phone ON unified_leads(phone);
CREATE INDEX IF NOT EXISTS idx_unified_leads_email ON unified_leads(email);
CREATE INDEX IF NOT EXISTS idx_unified_leads_created_at ON unified_leads(created_at DESC);

-- Create GIN index on extra_fields for JSONB queries
CREATE INDEX IF NOT EXISTS idx_unified_leads_extra_fields ON unified_leads USING GIN (extra_fields);

-- Add comment
COMMENT ON TABLE unified_leads IS 'Unified leads table that normalizes data from multiple portals with different schemas';
COMMENT ON COLUMN unified_leads.extra_fields IS 'JSONB column storing all unmatched/portal-specific fields';

