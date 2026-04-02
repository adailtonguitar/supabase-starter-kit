-- Addresses Supabase Security Advisor warnings (function search_path, permissive RLS).
-- Auth "Leaked password protection" must be enabled in Dashboard → Authentication → Providers → Email (or Auth settings).

-- ============================================================
-- 1) function_search_path_mutable — lock search_path on SECURITY DEFINER RPCs
-- ============================================================
DO $$
DECLARE
  sig text;
BEGIN
  SELECT p.oid::regprocedure::text
    INTO sig
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'check_rate_limit'
  LIMIT 1;
  IF sig IS NOT NULL THEN
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', sig);
  END IF;

  sig := NULL;
  SELECT p.oid::regprocedure::text
    INTO sig
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'lookup_ncm'
  LIMIT 1;
  IF sig IS NOT NULL THEN
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', sig);
  END IF;
END $$;

-- ============================================================
-- 2) rls_policy_always_true — companies: remove open INSERT for authenticated
--    (criação de empresa via Edge com service_role; não precisa INSERT com JWT de usuário)
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can create companies" ON public.companies;

-- ============================================================
-- 3) rls_policy_always_true — system_errors: não permitir WITH CHECK (true)
--    authenticated: só grava user_id próprio ou null
--    anon: só insert sem user_id (evita spoof de UUID de outro usuário)
-- ============================================================
DROP POLICY IF EXISTS "system_errors_insert" ON public.system_errors;
CREATE POLICY "system_errors_insert"
  ON public.system_errors
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "system_errors_anon_insert" ON public.system_errors;
CREATE POLICY "system_errors_anon_insert"
  ON public.system_errors
  FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL);
