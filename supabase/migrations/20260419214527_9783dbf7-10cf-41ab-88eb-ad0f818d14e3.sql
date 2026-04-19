-- =========================================
-- SUBSCRIPTIONS
-- =========================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid,
  plan_key text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  subscription_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_user_unique
  ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_company
  ON public.subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_active
  ON public.subscriptions(status, subscription_end);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access subscriptions" ON public.subscriptions;
CREATE POLICY "Service role full access subscriptions"
  ON public.subscriptions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users view own subscription" ON public.subscriptions;
CREATE POLICY "Users view own subscription"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- PAYMENTS
-- =========================================
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mp_payment_id text,
  user_id uuid,
  company_id uuid,
  plan_key text,
  amount numeric(12,2),
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_mp_payment_unique
  ON public.payments(mp_payment_id) WHERE mp_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_company ON public.payments(company_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON public.payments(user_id);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access payments" ON public.payments;
CREATE POLICY "Service role full access payments"
  ON public.payments FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users view own company payments" ON public.payments;
CREATE POLICY "Users view own company payments"
  ON public.payments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (company_id IS NOT NULL AND public.user_belongs_to_company(company_id)));

-- =========================================
-- PAYMENT WEBHOOK LOGS
-- =========================================
CREATE TABLE IF NOT EXISTS public.payment_webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mp_payment_id text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_mp_payment
  ON public.payment_webhook_logs(mp_payment_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created
  ON public.payment_webhook_logs(created_at DESC);

ALTER TABLE public.payment_webhook_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access webhook logs" ON public.payment_webhook_logs;
CREATE POLICY "Service role full access webhook logs"
  ON public.payment_webhook_logs FOR ALL TO service_role
  USING (true) WITH CHECK (true);