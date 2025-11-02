-- Ensure relationship between territories and subscriptions (not active_subscriptions)
-- This is the correct version since we're using the subscriptions table directly

BEGIN;

-- Ensure territories.subscription_id -> subscriptions(id) FK exists
ALTER TABLE public.territories
  DROP CONSTRAINT IF EXISTS territories_subscription_id_fkey;

ALTER TABLE public.territories
  ADD CONSTRAINT territories_subscription_id_fkey
  FOREIGN KEY (subscription_id)
  REFERENCES public.subscriptions(id)
  ON DELETE CASCADE;

-- Helpful index
CREATE INDEX IF NOT EXISTS idx_territories_subscription_id
  ON public.territories (subscription_id);

COMMIT;

