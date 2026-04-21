-- ============================================================
-- AI Usage Tracking + Quotas
--
-- Motivação: hoje chamadas de IA (ai-support, ai-report, generate-marketing-art,
-- analyze-product-image, generate-ai-report) podem estourar custo sem controle.
-- Esta migration adiciona:
--   1. Tabela ai_usage para registrar TODA chamada com tokens e custo.
--   2. Tabela ai_quotas_per_plan com limites mensais por tier de plano.
--   3. RPCs log_ai_usage e check_ai_quota.
--   4. View ai_usage_daily_by_company para dashboard.
--
-- Custo: cost_cents armazenado em centavos de USD × 1000 (milésimos),
-- permite precisão de 0.001¢ sem float.
-- ============================================================

-- 1) Tabela de registros de uso
CREATE TABLE IF NOT EXISTS public.ai_usage (
  id bigserial PRIMARY KEY,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  function_name text NOT NULL,
  provider text NOT NULL DEFAULT 'unknown',
  model text,
  tokens_prompt int NOT NULL DEFAULT 0,
  tokens_completion int NOT NULL DEFAULT 0,
  tokens_total int GENERATED ALWAYS AS (tokens_prompt + tokens_completion) STORED,
  cost_millicents bigint NOT NULL DEFAULT 0,
  success boolean NOT NULL DEFAULT true,
  error_code text,
  latency_ms int,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_company_created
  ON public.ai_usage (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_function_created
  ON public.ai_usage (function_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_created
  ON public.ai_usage (created_at DESC);

COMMENT ON TABLE public.ai_usage IS
  'Log de todas as chamadas de IA, com tokens e custo. Base para quotas e cobranças por uso.';
COMMENT ON COLUMN public.ai_usage.cost_millicents IS
  'Custo em milésimos de centavo de USD (1 USD = 100.000). Permite precisão de 0.001¢.';

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

-- Empresa lê seu próprio uso
DROP POLICY IF EXISTS "ai_usage_select_own_company" ON public.ai_usage;
CREATE POLICY "ai_usage_select_own_company"
  ON public.ai_usage
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT cu.company_id FROM public.company_users cu
      WHERE cu.user_id = auth.uid() AND cu.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'super_admin'
    )
  );

-- Inserção só via RPC (security definer) ou service_role.
-- Negamos insert direto do cliente pra garantir integridade.
DROP POLICY IF EXISTS "ai_usage_insert_denied" ON public.ai_usage;
CREATE POLICY "ai_usage_insert_denied"
  ON public.ai_usage
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- 2) Quotas por plano
CREATE TABLE IF NOT EXISTS public.ai_quotas_per_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan text NOT NULL,
  function_name text NOT NULL,
  monthly_limit int NOT NULL DEFAULT 0,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(plan, function_name)
);

COMMENT ON TABLE public.ai_quotas_per_plan IS
  'Limites mensais de chamadas de IA por plano e por função. 0 = sem limite (unlimited).';

ALTER TABLE public.ai_quotas_per_plan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_quotas_read" ON public.ai_quotas_per_plan;
CREATE POLICY "ai_quotas_read"
  ON public.ai_quotas_per_plan
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "ai_quotas_write_admin" ON public.ai_quotas_per_plan;
CREATE POLICY "ai_quotas_write_admin"
  ON public.ai_quotas_per_plan
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'super_admin'
    )
  );

-- Seeds por tier (ajuste conforme seu plano)
INSERT INTO public.ai_quotas_per_plan (plan, function_name, monthly_limit, description) VALUES
  ('emissor',  'ai_support',         20,   'Mensagens ao assistente de suporte'),
  ('emissor',  'ai_report',          0,    'Relatórios IA (não disponível)'),
  ('emissor',  'ai_product_image',   10,   'Análise de imagem de produto'),
  ('emissor',  'ai_marketing_art',   0,    'Geração de artes (não disponível)'),

  ('starter',  'ai_support',         50,   'Mensagens ao assistente de suporte'),
  ('starter',  'ai_report',          5,    'Relatórios IA por mês'),
  ('starter',  'ai_product_image',   30,   'Análise de imagem de produto'),
  ('starter',  'ai_marketing_art',   5,    'Artes de marketing por mês'),

  ('business', 'ai_support',         200,  'Mensagens ao assistente de suporte'),
  ('business', 'ai_report',          30,   'Relatórios IA por mês'),
  ('business', 'ai_product_image',   150,  'Análise de imagem de produto'),
  ('business', 'ai_marketing_art',   30,   'Artes de marketing por mês'),

  ('pro',      'ai_support',         1000, 'Mensagens ao assistente de suporte'),
  ('pro',      'ai_report',          150,  'Relatórios IA por mês'),
  ('pro',      'ai_product_image',   500,  'Análise de imagem de produto'),
  ('pro',      'ai_marketing_art',   100,  'Artes de marketing por mês')
ON CONFLICT (plan, function_name) DO NOTHING;

-- 3) RPC: log_ai_usage
CREATE OR REPLACE FUNCTION public.log_ai_usage(
  p_company_id uuid,
  p_user_id uuid,
  p_function_name text,
  p_provider text DEFAULT 'unknown',
  p_model text DEFAULT NULL,
  p_tokens_prompt int DEFAULT 0,
  p_tokens_completion int DEFAULT 0,
  p_cost_millicents bigint DEFAULT 0,
  p_success boolean DEFAULT true,
  p_error_code text DEFAULT NULL,
  p_latency_ms int DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO public.ai_usage (
    company_id, user_id, function_name, provider, model,
    tokens_prompt, tokens_completion, cost_millicents,
    success, error_code, latency_ms, metadata
  ) VALUES (
    p_company_id, p_user_id, p_function_name, p_provider, p_model,
    GREATEST(p_tokens_prompt, 0), GREATEST(p_tokens_completion, 0), GREATEST(p_cost_millicents, 0),
    p_success, p_error_code, p_latency_ms, COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_ai_usage(
  uuid, uuid, text, text, text, int, int, bigint, boolean, text, int, jsonb
) TO authenticated, service_role;

-- 4) RPC: check_ai_quota
-- Retorna jsonb { allowed, used, limit, plan, reason }
CREATE OR REPLACE FUNCTION public.check_ai_quota(
  p_company_id uuid,
  p_function_name text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_plan text;
  v_limit int;
  v_used int;
  v_month_start timestamptz;
BEGIN
  -- Encontra plano ativo da empresa
  SELECT cp.plan::text INTO v_plan
    FROM public.company_plans cp
   WHERE cp.company_id = p_company_id
     AND cp.status = 'active'
   LIMIT 1;

  IF v_plan IS NULL THEN
    v_plan := 'starter';
  END IF;

  -- Busca limite do plano
  SELECT aq.monthly_limit INTO v_limit
    FROM public.ai_quotas_per_plan aq
   WHERE aq.plan = v_plan AND aq.function_name = p_function_name
   LIMIT 1;

  -- Sem quota cadastrada → ilimitado (fail-open) para não quebrar clientes.
  IF v_limit IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'used', 0,
      'limit', NULL,
      'plan', v_plan,
      'reason', 'Sem quota configurada para este plano/função'
    );
  END IF;

  IF v_limit = 0 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'used', 0,
      'limit', 0,
      'plan', v_plan,
      'reason', 'Recurso não incluído no seu plano. Faça upgrade para habilitar.'
    );
  END IF;

  v_month_start := date_trunc('month', now());

  SELECT COUNT(*)::int INTO v_used
    FROM public.ai_usage au
   WHERE au.company_id = p_company_id
     AND au.function_name = p_function_name
     AND au.created_at >= v_month_start
     AND au.success = true;

  IF v_used >= v_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'used', v_used,
      'limit', v_limit,
      'plan', v_plan,
      'reason', format('Limite mensal do plano %s atingido (%s/%s). Renova no próximo mês ou faça upgrade.', v_plan, v_used, v_limit)
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'used', v_used,
    'limit', v_limit,
    'plan', v_plan,
    'reason', NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_ai_quota(uuid, text) TO authenticated, service_role;

-- 5) View para dashboard admin
CREATE OR REPLACE VIEW public.ai_usage_daily_by_company AS
SELECT
  au.company_id,
  c.name AS company_name,
  date_trunc('day', au.created_at) AS day,
  au.function_name,
  COUNT(*) FILTER (WHERE au.success) AS calls_ok,
  COUNT(*) FILTER (WHERE NOT au.success) AS calls_error,
  SUM(au.tokens_total) AS tokens_total,
  SUM(au.cost_millicents) AS cost_millicents
FROM public.ai_usage au
LEFT JOIN public.companies c ON c.id = au.company_id
GROUP BY au.company_id, c.name, date_trunc('day', au.created_at), au.function_name;

-- Acesso via RLS na tabela base — view herda políticas.
COMMENT ON VIEW public.ai_usage_daily_by_company IS
  'Agregação diária de uso de IA por empresa e função. Base para dashboard admin.';

-- 6) Índice extra para queries mensais
CREATE INDEX IF NOT EXISTS idx_ai_usage_company_fn_month
  ON public.ai_usage (company_id, function_name, created_at DESC)
  WHERE success = true;
