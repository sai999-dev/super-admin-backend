-- Migration: Create Subscription Management Tables
-- Description: Creates tables for subscription plans, subscriptions, and territories
-- Date: 2024-01-15

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- Table: subscription_plans
-- Description: Stores subscription plan definitions
-- =====================================================

CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    unit_type VARCHAR(20) NOT NULL CHECK (unit_type IN ('zipcode', 'city', 'county', 'state')),
    price_per_unit DECIMAL(10,2) NOT NULL CHECK (price_per_unit >= 0),
    max_units INTEGER CHECK (max_units >= 1),
    min_units INTEGER NOT NULL DEFAULT 1 CHECK (min_units >= 1),
    billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'quarterly', 'yearly')),
    trial_days INTEGER NOT NULL DEFAULT 0 CHECK (trial_days >= 0 AND trial_days <= 365),
    features JSONB DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for subscription_plans
CREATE INDEX idx_subscription_plans_is_active ON subscription_plans(is_active);
CREATE INDEX idx_subscription_plans_unit_type ON subscription_plans(unit_type);
CREATE INDEX idx_subscription_plans_sort_order ON subscription_plans(sort_order);

-- =====================================================
-- Table: subscriptions
-- Description: Stores agency subscriptions to plans
-- =====================================================

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'suspended', 'cancelled', 'expired')),
    current_units INTEGER NOT NULL DEFAULT 0 CHECK (current_units >= 0),
    max_units INTEGER,
    custom_price_per_unit DECIMAL(10,2) CHECK (custom_price_per_unit >= 0),
    billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'quarterly', 'yearly')),
    start_date TIMESTAMP NOT NULL DEFAULT NOW(),
    end_date TIMESTAMP,
    trial_end_date TIMESTAMP,
    next_billing_date TIMESTAMP,
    last_billing_date TIMESTAMP,
    auto_renew BOOLEAN NOT NULL DEFAULT true,
    cancelled_at TIMESTAMP,
    cancelled_by UUID,
    cancellation_reason TEXT,
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for subscriptions
CREATE INDEX idx_subscriptions_agency_id ON subscriptions(agency_id);
CREATE INDEX idx_subscriptions_plan_id ON subscriptions(plan_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_next_billing_date ON subscriptions(next_billing_date);
CREATE INDEX idx_subscriptions_trial_end_date ON subscriptions(trial_end_date);

-- =====================================================
-- Table: territories
-- Description: Stores agency-owned territories
-- =====================================================

CREATE TABLE IF NOT EXISTS territories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('zipcode', 'city', 'county', 'state')),
    value VARCHAR(100) NOT NULL,
    state VARCHAR(2),
    county VARCHAR(100),
    city VARCHAR(100),
    zipcode VARCHAR(10),
    is_active BOOLEAN NOT NULL DEFAULT true,
    priority INTEGER NOT NULL DEFAULT 0 CHECK (priority >= 0 AND priority <= 10),
    added_by UUID,
    deleted_at TIMESTAMP,
    deleted_by UUID,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_territory_per_subscription UNIQUE (subscription_id, type, value)
);

-- Indexes for territories
CREATE INDEX idx_territories_subscription_id ON territories(subscription_id);
CREATE INDEX idx_territories_agency_id ON territories(agency_id);
CREATE INDEX idx_territories_type_value ON territories(type, value);
CREATE INDEX idx_territories_zipcode ON territories(zipcode);
CREATE INDEX idx_territories_city_state ON territories(city, state);
CREATE INDEX idx_territories_is_active ON territories(is_active);
CREATE INDEX idx_territories_deleted_at ON territories(deleted_at);

-- =====================================================
-- Triggers for updated_at timestamps
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for subscription_plans
CREATE TRIGGER update_subscription_plans_updated_at
    BEFORE UPDATE ON subscription_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for subscriptions
CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for territories
CREATE TRIGGER update_territories_updated_at
    BEFORE UPDATE ON territories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Sample Data (Optional - for testing)
-- =====================================================

-- Insert sample subscription plans
INSERT INTO subscription_plans (name, description, unit_type, price_per_unit, max_units, min_units, billing_cycle, trial_days, features, is_active, sort_order)
VALUES 
    ('Basic Zipcode Plan', 'Perfect for small agencies starting out', 'zipcode', 50.00, 10, 1, 'monthly', 14, '{"lead_priority": "standard", "analytics_access": true}', true, 1),
    ('Professional Zipcode Plan', 'For growing agencies', 'zipcode', 45.00, 25, 5, 'monthly', 14, '{"lead_priority": "high", "analytics_access": true, "api_access": true}', true, 2),
    ('Enterprise Zipcode Plan', 'For large agencies', 'zipcode', 40.00, NULL, 10, 'monthly', 30, '{"lead_priority": "urgent", "analytics_access": true, "api_access": true, "dedicated_support": true}', true, 3),
    ('City Coverage Plan', 'Cover entire cities', 'city', 150.00, 5, 1, 'monthly', 14, '{"lead_priority": "high", "analytics_access": true}', true, 4),
    ('County Coverage Plan', 'Cover entire counties', 'county', 500.00, 3, 1, 'monthly', 30, '{"lead_priority": "urgent", "analytics_access": true, "dedicated_support": true}', true, 5)
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- Views for reporting
-- =====================================================

-- View: Active subscriptions with plan details
CREATE OR REPLACE VIEW v_active_subscriptions AS
SELECT 
    s.id AS subscription_id,
    s.agency_id,
    a.business_name AS agency_name,
    a.email AS agency_email,
    s.plan_id,
    sp.name AS plan_name,
    sp.unit_type,
    COALESCE(s.custom_price_per_unit, sp.price_per_unit) AS effective_price_per_unit,
    s.current_units,
    COALESCE(s.max_units, sp.max_units) AS effective_max_units,
    s.status,
    s.billing_cycle,
    s.next_billing_date,
    s.trial_end_date,
    s.auto_renew,
    (COALESCE(s.custom_price_per_unit, sp.price_per_unit) * s.current_units) AS monthly_revenue,
    s.created_at,
    s.updated_at
FROM subscriptions s
INNER JOIN agencies a ON s.agency_id = a.id
INNER JOIN subscription_plans sp ON s.plan_id = sp.id
WHERE s.status IN ('trial', 'active');

-- View: Territory coverage summary
CREATE OR REPLACE VIEW v_territory_coverage AS
SELECT 
    t.agency_id,
    a.business_name AS agency_name,
    t.subscription_id,
    t.type AS territory_type,
    COUNT(*) AS territory_count,
    COUNT(*) FILTER (WHERE t.is_active = true) AS active_territories,
    array_agg(t.value ORDER BY t.value) AS territory_values
FROM territories t
INNER JOIN agencies a ON t.agency_id = a.id
WHERE t.deleted_at IS NULL
GROUP BY t.agency_id, a.business_name, t.subscription_id, t.type;

-- View: Territory conflicts
CREATE OR REPLACE VIEW v_territory_conflicts AS
SELECT 
    t.type,
    t.value,
    t.state,
    t.city,
    COUNT(DISTINCT t.agency_id) AS agency_count,
    array_agg(DISTINCT a.business_name ORDER BY a.business_name) AS agency_names,
    array_agg(DISTINCT t.agency_id) AS agency_ids
FROM territories t
INNER JOIN agencies a ON t.agency_id = a.id
WHERE t.is_active = true AND t.deleted_at IS NULL
GROUP BY t.type, t.value, t.state, t.city
HAVING COUNT(DISTINCT t.agency_id) > 1;

-- View: Subscription revenue summary
CREATE OR REPLACE VIEW v_subscription_revenue AS
SELECT 
    DATE_TRUNC('month', s.created_at) AS month,
    COUNT(*) AS total_subscriptions,
    COUNT(*) FILTER (WHERE s.status = 'active') AS active_subscriptions,
    COUNT(*) FILTER (WHERE s.status = 'trial') AS trial_subscriptions,
    SUM(COALESCE(s.custom_price_per_unit, sp.price_per_unit) * s.current_units) AS total_monthly_revenue,
    AVG(COALESCE(s.custom_price_per_unit, sp.price_per_unit) * s.current_units) AS avg_subscription_value
FROM subscriptions s
INNER JOIN subscription_plans sp ON s.plan_id = sp.id
WHERE s.status IN ('trial', 'active')
GROUP BY DATE_TRUNC('month', s.created_at)
ORDER BY month DESC;

-- =====================================================
-- Functions for business logic
-- =====================================================

-- Function: Check if agency can add more territories
CREATE OR REPLACE FUNCTION can_add_territories(
    p_subscription_id UUID,
    p_count INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
    v_current_units INTEGER;
    v_max_units INTEGER;
    v_plan_max_units INTEGER;
BEGIN
    SELECT 
        s.current_units,
        s.max_units,
        sp.max_units
    INTO 
        v_current_units,
        v_max_units,
        v_plan_max_units
    FROM subscriptions s
    INNER JOIN subscription_plans sp ON s.plan_id = sp.id
    WHERE s.id = p_subscription_id;
    
    -- If no max units set, allow unlimited
    IF v_max_units IS NULL AND v_plan_max_units IS NULL THEN
        RETURN TRUE;
    END IF;
    
    -- Check against effective max units
    IF (v_current_units + p_count) <= COALESCE(v_max_units, v_plan_max_units) THEN
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Function: Get subscription utilization percentage
CREATE OR REPLACE FUNCTION get_subscription_utilization(
    p_subscription_id UUID
) RETURNS DECIMAL AS $$
DECLARE
    v_current_units INTEGER;
    v_max_units INTEGER;
BEGIN
    SELECT 
        s.current_units,
        COALESCE(s.max_units, sp.max_units)
    INTO 
        v_current_units,
        v_max_units
    FROM subscriptions s
    INNER JOIN subscription_plans sp ON s.plan_id = sp.id
    WHERE s.id = p_subscription_id;
    
    -- If no max units, return 0 (unlimited)
    IF v_max_units IS NULL THEN
        RETURN 0;
    END IF;
    
    -- Calculate percentage
    RETURN (v_current_units::DECIMAL / v_max_units::DECIMAL) * 100;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Grants (adjust based on your user setup)
-- =====================================================

-- Grant permissions to application user
-- GRANT SELECT, INSERT, UPDATE, DELETE ON subscription_plans TO leadmarketplace_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON subscriptions TO leadmarketplace_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON territories TO leadmarketplace_user;
-- GRANT SELECT ON v_active_subscriptions TO leadmarketplace_user;
-- GRANT SELECT ON v_territory_coverage TO leadmarketplace_user;
-- GRANT SELECT ON v_territory_conflicts TO leadmarketplace_user;
-- GRANT SELECT ON v_subscription_revenue TO leadmarketplace_user;

-- =====================================================
-- Comments for documentation
-- =====================================================

COMMENT ON TABLE subscription_plans IS 'Defines subscription plan templates with pricing and limits';
COMMENT ON TABLE subscriptions IS 'Tracks agency subscriptions to plans';
COMMENT ON TABLE territories IS 'Stores agency-owned territories for lead distribution';

COMMENT ON COLUMN subscription_plans.unit_type IS 'Type of territory unit: zipcode, city, county, or state';
COMMENT ON COLUMN subscription_plans.price_per_unit IS 'Price per territory unit in USD';
COMMENT ON COLUMN subscription_plans.max_units IS 'Maximum territories allowed, NULL = unlimited';
COMMENT ON COLUMN subscription_plans.trial_days IS 'Number of trial days for new subscriptions';

COMMENT ON COLUMN subscriptions.current_units IS 'Number of territories currently assigned';
COMMENT ON COLUMN subscriptions.custom_price_per_unit IS 'Override plan pricing for this subscription';
COMMENT ON COLUMN subscriptions.auto_renew IS 'Whether subscription auto-renews at end of billing cycle';

COMMENT ON COLUMN territories.priority IS 'Lead distribution priority (0-10, higher = more priority)';
COMMENT ON COLUMN territories.deleted_at IS 'Soft delete timestamp for paranoid deletion';

-- =====================================================
-- Migration Complete
-- =====================================================

-- Verify tables were created
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subscription_plans') AND
       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subscriptions') AND
       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'territories') THEN
        RAISE NOTICE 'Migration completed successfully! All tables created.';
    ELSE
        RAISE EXCEPTION 'Migration failed! Some tables were not created.';
    END IF;
END $$;
