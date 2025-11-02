-- Align live DB schema with backend expectations
-- Safe-guards: only add if missing

ALTER TABLE IF EXISTS public.subscriptions
  ADD COLUMN IF NOT EXISTS start_date TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS end_date TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS trial_end_date TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS last_billing_date TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN DEFAULT true;

-- Ensure commonly used optional numeric fields exist
ALTER TABLE IF EXISTS public.subscriptions
  ADD COLUMN IF NOT EXISTS current_units INTEGER,
  ADD COLUMN IF NOT EXISTS max_units INTEGER,
  ADD COLUMN IF NOT EXISTS custom_price_per_unit NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20);

-- Territories flags
ALTER TABLE IF EXISTS public.territories
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;

-- Audit logs common columns
ALTER TABLE IF EXISTS public.audit_logs
  ADD COLUMN IF NOT EXISTS actor_id UUID,
  ADD COLUMN IF NOT EXISTS actor_email TEXT,
  ADD COLUMN IF NOT EXISTS resource_type TEXT,
  ADD COLUMN IF NOT EXISTS resource_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;