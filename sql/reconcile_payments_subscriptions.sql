-- =====================================================================
-- RECONCILIAÇÃO DE PAGAMENTOS ÓRFÃOS  →  SUBSCRIPTIONS ATIVAS
-- Projeto alvo: fsvxpxziotklbxkivyug (Supabase de PRODUÇÃO)
-- Execute no SQL Editor do Supabase. Idempotente: pode rodar várias vezes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Garantir tabela de logs de webhook (mesmo schema do projeto novo)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_webhook_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mp_payment_id TEXT,
  payload       JSONB,
  processed     BOOLEAN NOT NULL DEFAULT false,
  processed_at  TIMESTAMPTZ,
  error_message TEXT,
  retry_count   INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_webhook_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access webhook logs" ON public.payment_webhook_logs;
CREATE POLICY "Service role full access webhook logs"
  ON public.payment_webhook_logs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_mp_payment ON public.payment_webhook_logs(mp_payment_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created   ON public.payment_webhook_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_unprocessed
  ON public.payment_webhook_logs(processed) WHERE processed = false;

-- ---------------------------------------------------------------------
-- 2) Garantir UNIQUE em subscriptions(user_id) para permitir UPSERT
--    (se já existir, é no-op via DO block)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_user_id_unique'
  ) THEN
    -- Antes de criar a UNIQUE, deduplicar por user_id mantendo a mais recente
    DELETE FROM public.subscriptions s
    USING public.subscriptions s2
    WHERE s.user_id = s2.user_id
      AND s.created_at < s2.created_at;

    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_user_id_unique UNIQUE (user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3) Função utilitária: mapear amount → plan_key quando vier nulo
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._infer_plan_key(p_amount NUMERIC, p_existing TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    NULLIF(p_existing, ''),
    CASE
      WHEN p_amount IS NULL          THEN 'starter'
      WHEN p_amount <= 1.50          THEN 'starter'   -- plano TESTE R$1
      WHEN p_amount BETWEEN 50  AND 250  THEN 'business'
      WHEN p_amount BETWEEN 251 AND 500  THEN 'pro'
      ELSE 'starter'
    END
  );
$$;

-- ---------------------------------------------------------------------
-- 4) Reconciliar: para cada payment APROVADO sem subscription ativa,
--    criar/atualizar a subscription com 30 dias de validade.
-- ---------------------------------------------------------------------
WITH approved AS (
  SELECT
    p.user_id,
    p.company_id,
    public._infer_plan_key(p.amount, p.plan_key) AS plan_key,
    MAX(p.created_at) AS paid_at
  FROM public.payments p
  WHERE p.status IN ('approved', 'paid', 'authorized')
    AND p.user_id IS NOT NULL
  GROUP BY p.user_id, p.company_id, public._infer_plan_key(p.amount, p.plan_key)
)
INSERT INTO public.subscriptions (user_id, company_id, plan_key, status, subscription_end, created_at, updated_at)
SELECT
  a.user_id,
  a.company_id,
  a.plan_key,
  'active',
  a.paid_at + interval '30 days',
  now(),
  now()
FROM approved a
ON CONFLICT (user_id) DO UPDATE
SET plan_key         = EXCLUDED.plan_key,
    company_id       = COALESCE(EXCLUDED.company_id, public.subscriptions.company_id),
    status           = 'active',
    subscription_end = GREATEST(
                          COALESCE(public.subscriptions.subscription_end, now()),
                          EXCLUDED.subscription_end
                        ),
    updated_at       = now();

-- ---------------------------------------------------------------------
-- 5) Relatório final — confira o resultado
-- ---------------------------------------------------------------------
SELECT
  s.user_id,
  s.company_id,
  s.plan_key,
  s.status,
  s.subscription_end,
  (SELECT COUNT(*) FROM public.payments p
     WHERE p.user_id = s.user_id AND p.status IN ('approved','paid','authorized')
  ) AS approved_payments
FROM public.subscriptions s
ORDER BY s.updated_at DESC
LIMIT 20;
