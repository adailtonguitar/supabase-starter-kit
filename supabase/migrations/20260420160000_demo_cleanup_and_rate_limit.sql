-- ============================================================================
-- Demo accounts: cleanup automático + rate limit persistente
--
-- Problema: o botão "Testar sem cadastro" da landing criou 262 usuários demo
-- órfãos em auth.users ao longo de março/2026. As empresas e dados foram
-- limpos manualmente, mas os users ficaram. Root cause:
--   1. Função cleanup_expired_demo_companies() NÃO existia (cron chamava vazio)
--   2. Rate limit era in-memory (perdia estado quando Edge Function dormia)
--   3. Cleanup não deletava user do auth.users junto com a empresa
--
-- Esta migração resolve tudo isso.
-- ============================================================================

-- 1) Tabela de rate limit persistente para demo_account
CREATE TABLE IF NOT EXISTS public.demo_account_attempts (
  id bigserial PRIMARY KEY,
  ip_address text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_demo_attempts_ip_recent
  ON public.demo_account_attempts (ip_address, created_at DESC);

COMMENT ON TABLE public.demo_account_attempts IS
  'Registra cada tentativa de criar conta demo via botão da landing. Usado para rate limit persistente (3 por IP por hora).';

-- RLS: ninguém lê/escreve via API — só service_role da Edge Function
ALTER TABLE public.demo_account_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny all demo_account_attempts" ON public.demo_account_attempts;
CREATE POLICY "deny all demo_account_attempts"
  ON public.demo_account_attempts
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- 2) Função de rate limit: retorna true se DEVE bloquear
CREATE OR REPLACE FUNCTION public.check_demo_rate_limit(
  p_ip text,
  p_user_agent text DEFAULT NULL,
  p_window_minutes int DEFAULT 60,
  p_max_attempts int DEFAULT 3
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  -- Conta tentativas do IP na janela
  SELECT COUNT(*)
    INTO v_count
    FROM public.demo_account_attempts
   WHERE ip_address = p_ip
     AND created_at > now() - (p_window_minutes || ' minutes')::interval;

  IF v_count >= p_max_attempts THEN
    RETURN true; -- bloqueia
  END IF;

  -- Registra tentativa
  INSERT INTO public.demo_account_attempts (ip_address, user_agent)
    VALUES (p_ip, p_user_agent);

  RETURN false; -- permite
END;
$$;

COMMENT ON FUNCTION public.check_demo_rate_limit IS
  'Rate limit persistente para criação de contas demo. Retorna true se o IP excedeu o limite.';

-- 3) Função de limpeza de contas demo expiradas
-- Deleta:
--   - Empresas demo expiradas (is_demo=true AND created_at > 7 dias OU company_plans.expires_at < now())
--   - Todos os dados em cascata (sales, products, clients, etc.)
--   - O user em auth.users SE não estiver em nenhuma outra empresa
CREATE OR REPLACE FUNCTION public.cleanup_expired_demo_companies()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company record;
  v_user_id uuid;
  v_companies_deleted int := 0;
  v_users_deleted int := 0;
  v_attempts_cleaned int := 0;
BEGIN
  -- Loop nas empresas demo expiradas
  FOR v_company IN
    SELECT c.id, c.name
      FROM public.companies c
     WHERE c.is_demo = true
       AND (
         c.created_at < now() - interval '7 days'
         OR EXISTS (
           SELECT 1 FROM public.company_plans cp
            WHERE cp.company_id = c.id
              AND cp.expires_at IS NOT NULL
              AND cp.expires_at < now()
         )
       )
  LOOP
    -- Coleta os user_ids dessa empresa ANTES de deletar (senão perde a referência)
    FOR v_user_id IN
      SELECT cu.user_id
        FROM public.company_users cu
       WHERE cu.company_id = v_company.id
    LOOP
      -- Só deleta o user se ele não está em NENHUMA OUTRA empresa
      IF NOT EXISTS (
        SELECT 1 FROM public.company_users cu2
         WHERE cu2.user_id = v_user_id
           AND cu2.company_id <> v_company.id
      ) THEN
        -- Deleta do auth.users (cascade apaga profile, etc.)
        DELETE FROM auth.users WHERE id = v_user_id;
        v_users_deleted := v_users_deleted + 1;
      END IF;
    END LOOP;

    -- Deleta a empresa (cascata apaga company_users, products, sales, etc.)
    DELETE FROM public.companies WHERE id = v_company.id;
    v_companies_deleted := v_companies_deleted + 1;
  END LOOP;

  -- Limpa também registros antigos de rate limit (mais de 7 dias)
  DELETE FROM public.demo_account_attempts
   WHERE created_at < now() - interval '7 days';
  GET DIAGNOSTICS v_attempts_cleaned = ROW_COUNT;

  -- Limpa usuários demo órfãos (email @demo.anthosystem.com sem empresa)
  -- Isso pega casos onde a empresa foi deletada manualmente mas o user sobrou
  WITH demo_orfaos AS (
    SELECT u.id
      FROM auth.users u
     WHERE u.email LIKE 'demo_%@demo.anthosystem.com'
       AND NOT EXISTS (
         SELECT 1 FROM public.company_users cu WHERE cu.user_id = u.id
       )
  )
  DELETE FROM auth.users WHERE id IN (SELECT id FROM demo_orfaos);
  GET DIAGNOSTICS v_user_id = ROW_COUNT; -- reuso da variável
  v_users_deleted := v_users_deleted + COALESCE(v_user_id::int, 0);

  RETURN jsonb_build_object(
    'executed_at', now(),
    'companies_deleted', v_companies_deleted,
    'users_deleted', v_users_deleted,
    'rate_limit_records_cleaned', v_attempts_cleaned
  );
END;
$$;

COMMENT ON FUNCTION public.cleanup_expired_demo_companies IS
  'Deleta empresas demo com +7 dias OU com plano expirado, junto com users que não têm outra empresa. Também remove users órfãos @demo.anthosystem.com.';

-- 4) Cron diário às 03:00 UTC (00:00 BRT)
-- Primeiro remove se já existir com esse nome
DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'cleanup_demo_daily';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
END $$;

SELECT cron.schedule(
  'cleanup_demo_daily',
  '0 3 * * *',
  $$ SELECT public.cleanup_expired_demo_companies(); $$
);
