-- ============================================================
-- Dunning / inadimplência
-- ============================================================
-- Motivação:
--   Hoje a assinatura simplesmente expira em subscription_end
--   e o cliente entra em grace_period (3d) antes de ser bloqueado.
--   Não há retry de pagamento, nem notificação progressiva, nem
--   trilha de auditoria do que aconteceu na cobrança.
--
-- O que esta migração faz:
--   1) Adiciona colunas de estado de dunning em subscriptions.
--   2) Cria tabela dunning_events (timeline por empresa).
--   3) Função RPC get_subscription_dunning_state para a página
--      "minha assinatura" exibir status + próximos passos.
--   4) View dunning_targets usada pela Edge Function diária
--      para decidir quem notificar / bloquear.
--
-- Estados de grace_stage (string):
--   null        → assinatura ativa ou cliente em trial
--   'warning'   → 0–3 dias após subscription_end (ainda lê/escreve)
--   'readonly'  → 4–14 dias (cliente vê os dados mas não cria nada)
--   'blocked'   → >14 dias (redireciona para /renovar)
-- ============================================================

-- 0) Helper is_super_admin() — reutilizado por várias migrations
-- ------------------------------------------------------------
-- Cria só se ainda não existir. Usa admin_roles (padrão do projeto).
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_roles ar
    WHERE ar.user_id = auth.uid() AND ar.role = 'super_admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

COMMENT ON FUNCTION public.is_super_admin() IS
  'Retorna TRUE se o usuário autenticado tem role super_admin em admin_roles.
   STABLE + SECURITY DEFINER para uso em policies RLS.';

-- 1) Colunas em subscriptions
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS payment_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_retry_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_payment_error text,
  ADD COLUMN IF NOT EXISTS grace_stage text
    CHECK (grace_stage IS NULL OR grace_stage IN ('warning', 'readonly', 'blocked')),
  ADD COLUMN IF NOT EXISTS dunning_last_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS dunning_notification_count int NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_subscriptions_grace_stage
  ON public.subscriptions(grace_stage)
  WHERE grace_stage IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_next_retry
  ON public.subscriptions(next_retry_at)
  WHERE next_retry_at IS NOT NULL;

COMMENT ON COLUMN public.subscriptions.grace_stage IS
  'Estágio de dunning. null=ativa, warning=<3d pós-vencimento, readonly=4-14d, blocked=>14d.';

-- 2) dunning_events: histórico auditável
CREATE TABLE IF NOT EXISTS public.dunning_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  -- payment_failed, retry_scheduled, retry_ok, reminder_sent_3d,
  -- reminder_sent_overdue, stage_changed, manual_note
  previous_stage text,
  new_stage text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dunning_events_company
  ON public.dunning_events(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dunning_events_subscription
  ON public.dunning_events(subscription_id, created_at DESC);

ALTER TABLE public.dunning_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dunning_events_service_all" ON public.dunning_events;
CREATE POLICY "dunning_events_service_all"
  ON public.dunning_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "dunning_events_read_own_company" ON public.dunning_events;
CREATE POLICY "dunning_events_read_own_company"
  ON public.dunning_events FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (company_id IS NOT NULL AND public.user_belongs_to_company(company_id))
  );

DROP POLICY IF EXISTS "dunning_events_admin_read" ON public.dunning_events;
CREATE POLICY "dunning_events_admin_read"
  ON public.dunning_events FOR SELECT TO authenticated
  USING (public.is_super_admin());

COMMENT ON TABLE public.dunning_events IS
  'Timeline de eventos de cobrança (falhas, retries, notificações). Base para auditoria e página minha-assinatura.';

-- 3) Função que calcula grace_stage atual a partir de subscription_end
CREATE OR REPLACE FUNCTION public.compute_grace_stage(
  p_subscription_end timestamptz,
  p_status text
) RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_days int;
BEGIN
  IF p_subscription_end IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_status = 'canceled' THEN
    RETURN NULL;
  END IF;

  v_days := GREATEST(0, EXTRACT(EPOCH FROM (now() - p_subscription_end)) / 86400)::int;

  IF p_subscription_end >= now() THEN
    RETURN NULL;
  ELSIF v_days <= 3 THEN
    RETURN 'warning';
  ELSIF v_days <= 14 THEN
    RETURN 'readonly';
  ELSE
    RETURN 'blocked';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.compute_grace_stage(timestamptz, text) IS
  'Retorna o estágio de dunning baseado em quanto tempo passou de subscription_end.';

-- 4) RPC consumido pela página minha-assinatura
CREATE OR REPLACE FUNCTION public.get_subscription_dunning_state(p_company_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_company uuid := p_company_id;
  v_sub record;
  v_stage text;
  v_days_until int;
  v_days_since int;
  v_last_payment record;
  v_recent_events jsonb;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthenticated');
  END IF;

  -- Resolve company
  IF v_company IS NULL THEN
    SELECT company_id INTO v_company
    FROM public.company_users
    WHERE user_id = v_user AND is_active = true
    ORDER BY created_at ASC
    LIMIT 1;
  ELSE
    -- Autorização: user precisa pertencer à empresa
    IF NOT public.user_belongs_to_company(v_company) AND NOT public.is_super_admin() THEN
      RETURN jsonb_build_object('error', 'forbidden');
    END IF;
  END IF;

  SELECT * INTO v_sub
  FROM public.subscriptions
  WHERE (v_company IS NOT NULL AND company_id = v_company)
     OR (v_company IS NULL AND user_id = v_user)
  ORDER BY
    CASE WHEN status = 'active' THEN 0 ELSE 1 END,
    subscription_end DESC NULLS LAST,
    created_at DESC
  LIMIT 1;

  IF v_sub IS NULL THEN
    RETURN jsonb_build_object(
      'has_subscription', false,
      'company_id', v_company
    );
  END IF;

  v_stage := public.compute_grace_stage(v_sub.subscription_end, v_sub.status);

  IF v_sub.subscription_end IS NOT NULL THEN
    v_days_until := CEIL(EXTRACT(EPOCH FROM (v_sub.subscription_end - now())) / 86400)::int;
    v_days_since := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (now() - v_sub.subscription_end)) / 86400))::int;
  END IF;

  SELECT row_to_json(p)::jsonb INTO v_last_payment
  FROM (
    SELECT mp_payment_id, amount, status, created_at, plan_key
    FROM public.payments
    WHERE user_id = v_sub.user_id
       OR (v_company IS NOT NULL AND company_id = v_company)
    ORDER BY created_at DESC
    LIMIT 1
  ) p;

  SELECT COALESCE(jsonb_agg(row_to_json(e)), '[]'::jsonb) INTO v_recent_events
  FROM (
    SELECT event_type, previous_stage, new_stage, meta, created_at
    FROM public.dunning_events
    WHERE subscription_id = v_sub.id
    ORDER BY created_at DESC
    LIMIT 10
  ) e;

  RETURN jsonb_build_object(
    'has_subscription', true,
    'subscription_id', v_sub.id,
    'company_id', v_company,
    'plan_key', v_sub.plan_key,
    'status', v_sub.status,
    'subscription_end', v_sub.subscription_end,
    'grace_stage', v_stage,
    'days_until_due', CASE WHEN v_sub.subscription_end >= now() THEN v_days_until ELSE NULL END,
    'days_overdue', CASE WHEN v_sub.subscription_end < now() THEN v_days_since ELSE NULL END,
    'payment_failed_at', v_sub.payment_failed_at,
    'payment_retry_count', v_sub.payment_retry_count,
    'next_retry_at', v_sub.next_retry_at,
    'last_payment_error', v_sub.last_payment_error,
    'last_payment', v_last_payment,
    'recent_events', v_recent_events
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_subscription_dunning_state(uuid) TO authenticated;

-- 5) View auxiliar para Edge Function de cron diário
CREATE OR REPLACE VIEW public.dunning_targets AS
SELECT
  s.id AS subscription_id,
  s.company_id,
  s.user_id,
  s.plan_key,
  s.status,
  s.subscription_end,
  s.grace_stage AS current_stage,
  public.compute_grace_stage(s.subscription_end, s.status) AS computed_stage,
  s.dunning_last_notified_at,
  s.dunning_notification_count,
  c.name AS company_name,
  c.email AS company_email,
  s.payment_retry_count,
  s.payment_failed_at
FROM public.subscriptions s
LEFT JOIN public.companies c ON c.id = s.company_id
WHERE s.status IN ('active', 'past_due')
  AND s.subscription_end IS NOT NULL;

COMMENT ON VIEW public.dunning_targets IS
  'Assinaturas candidatas a processamento de dunning diário. Edge function filtra por stage.';
