-- Corrige gaps detectados na auditoria:
-- - discount_limits: RLS ON sem policies (quebra usePermissions / leitura de limites)
-- - uptime_logs: RLS ON sem policies (script antigo usava has_role(), pode não existir)
-- - ncm_codes, rate_limits: RLS OFF — catálogo interno / tabela sensível

-- ============================================================
-- 1) discount_limits (mesmo contrato de sql/rls_role_protection.sql)
-- ============================================================
DO $$
BEGIN
  IF to_regclass('public.discount_limits') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.discount_limits ENABLE ROW LEVEL SECURITY;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'discount_limits'
      AND policyname = 'Company users can view discount limits'
  ) THEN
    CREATE POLICY "Company users can view discount limits"
    ON public.discount_limits
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.company_users cu
        WHERE cu.user_id = auth.uid()
          AND cu.company_id = discount_limits.company_id
          AND cu.is_active = true
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'discount_limits'
      AND policyname = 'Admins can manage discount limits'
  ) THEN
    CREATE POLICY "Admins can manage discount limits"
    ON public.discount_limits
    FOR ALL
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.company_users cu
        WHERE cu.user_id = auth.uid()
          AND cu.company_id = discount_limits.company_id
          AND cu.role = 'admin'
          AND cu.is_active = true
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.company_users cu
        WHERE cu.user_id = auth.uid()
          AND cu.company_id = discount_limits.company_id
          AND cu.role = 'admin'
          AND cu.is_active = true
      )
    );
  END IF;
END $$;

-- ============================================================
-- 2) uptime_logs (sem depender de has_role())
-- ============================================================
DO $$
BEGIN
  IF to_regclass('public.uptime_logs') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.uptime_logs ENABLE ROW LEVEL SECURITY;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'uptime_logs'
      AND policyname = 'core_uptime_logs_super_admin_select'
  ) THEN
    CREATE POLICY core_uptime_logs_super_admin_select
    ON public.uptime_logs
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.admin_roles ar
        WHERE ar.user_id = auth.uid() AND ar.role = 'super_admin'
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'uptime_logs'
      AND policyname = 'core_uptime_logs_service_role_all'
  ) THEN
    CREATE POLICY core_uptime_logs_service_role_all
    ON public.uptime_logs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- 3) ncm_codes — catálogo global: leitura para usuários logados
-- ============================================================
DO $$
BEGIN
  IF to_regclass('public.ncm_codes') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.ncm_codes ENABLE ROW LEVEL SECURITY;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ncm_codes'
      AND policyname = 'core_ncm_codes_authenticated_select'
  ) THEN
    CREATE POLICY core_ncm_codes_authenticated_select
    ON public.ncm_codes
    FOR SELECT
    TO authenticated
    USING (true);
  END IF;
END $$;

-- ============================================================
-- 4) rate_limits — sem policies para authenticated = acesso direto negado;
--    service_role mantém bypass explícito (consistência)
-- ============================================================
DO $$
BEGIN
  IF to_regclass('public.rate_limits') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rate_limits'
      AND policyname = 'core_rate_limits_service_role_all'
  ) THEN
    CREATE POLICY core_rate_limits_service_role_all
    ON public.rate_limits
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;
