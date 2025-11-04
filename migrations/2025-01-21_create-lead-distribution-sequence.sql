-- Create lead_distribution_sequence table for round-robin tracking
-- This table tracks which agency was last assigned a lead in each territory
-- to ensure fair distribution across agencies

CREATE TABLE IF NOT EXISTS lead_distribution_sequence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    territory VARCHAR(100) NOT NULL,
    sequence_number INTEGER DEFAULT 1,
    last_assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total_leads_assigned INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(agency_id, territory)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_lead_distribution_sequence_territory 
    ON lead_distribution_sequence(territory);

CREATE INDEX IF NOT EXISTS idx_lead_distribution_sequence_agency 
    ON lead_distribution_sequence(agency_id);

CREATE INDEX IF NOT EXISTS idx_lead_distribution_sequence_last_assigned 
    ON lead_distribution_sequence(last_assigned_at);

-- Add RLS policies
ALTER TABLE lead_distribution_sequence ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role full access to lead_distribution_sequence" 
    ON lead_distribution_sequence FOR ALL 
    TO service_role 
    USING (true)
    WITH CHECK (true);

-- Authenticated users can view (for admin portal)
CREATE POLICY "Authenticated users can view distribution sequence" 
    ON lead_distribution_sequence FOR SELECT 
    TO authenticated 
    USING (true);

COMMENT ON TABLE lead_distribution_sequence IS 'Tracks lead distribution sequence for round-robin fairness';
COMMENT ON COLUMN lead_distribution_sequence.territory IS 'Territory identifier (zipcode or city)';
COMMENT ON COLUMN lead_distribution_sequence.sequence_number IS 'Current sequence number for this agency-territory pair';
COMMENT ON COLUMN lead_distribution_sequence.total_leads_assigned IS 'Total leads assigned to this agency for this territory';

