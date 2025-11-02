-- Ensure subscriptions has FKs to agencies and subscription_plans

BEGIN;

-- subscriptions.agency_id -> agencies(id)
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_agency_id_fkey;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_agency_id_fkey
  FOREIGN KEY (agency_id) REFERENCES public.agencies(id);

-- subscriptions.plan_id -> subscription_plans(id)
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_plan_id_fkey;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_plan_id_fkey
  FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_agency_id
  ON public.subscriptions (agency_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_id
  ON public.subscriptions (plan_id);

COMMIT;
