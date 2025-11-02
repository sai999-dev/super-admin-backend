-- Create agency_subscriptions table
-- This table is used by the admin portal to display subscriptions
-- Date: 2025-10-30

BEGIN;

CREATE TABLE IF NOT EXISTS agency_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trial', 'cancelled', 'expired', 'suspended')),
  start_date TIMESTAMP NOT NULL DEFAULT NOW(),
  end_date TIMESTAMP,
  trial_end_date TIMESTAMP,
  monthly_payment DECIMAL(10,2) DEFAULT 0 CHECK (monthly_payment >= 0),
  auto_renew BOOLEAN DEFAULT true,
  zipcodes JSONB DEFAULT '[]'::jsonb,
  cities JSONB DEFAULT '[]'::jsonb,
  cancellation_date TIMESTAMP,
  cancellation_reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_agency_subscriptions_agency_id ON agency_subscriptions(agency_id);
CREATE INDEX IF NOT EXISTS idx_agency_subscriptions_plan_id ON agency_subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_agency_subscriptions_subscription_id ON agency_subscriptions(subscription_id);
CREATE INDEX IF NOT EXISTS idx_agency_subscriptions_status ON agency_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_agency_subscriptions_start_date ON agency_subscriptions(start_date);

COMMIT;

