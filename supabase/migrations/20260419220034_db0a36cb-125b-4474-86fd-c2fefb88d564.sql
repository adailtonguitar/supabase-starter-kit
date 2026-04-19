-- =========================================
-- payment_webhook_logs: campos para retry
-- =========================================
ALTER TABLE public.payment_webhook_logs
  ADD COLUMN IF NOT EXISTS processed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_webhook_logs_unprocessed
  ON public.payment_webhook_logs(processed, created_at)
  WHERE processed = false;

-- =========================================
-- subscriptions: unicidade por company_id
-- =========================================
DROP INDEX IF EXISTS public.idx_subscriptions_user_unique;

-- Antes do unique por company_id, deduplicar mantendo a mais recente por company
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY company_id
           ORDER BY (status = 'active') DESC,
                    subscription_end DESC NULLS LAST,
                    updated_at DESC
         ) AS rn
  FROM public.subscriptions
  WHERE company_id IS NOT NULL
)
DELETE FROM public.subscriptions s
USING ranked r
WHERE s.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_company_unique
  ON public.subscriptions(company_id)
  WHERE company_id IS NOT NULL;

-- =========================================
-- subscriptions.status: CHECK constraint
-- =========================================
UPDATE public.subscriptions
SET status = 'active'
WHERE status NOT IN ('active','expired','canceled','past_due');

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active','expired','canceled','past_due'));