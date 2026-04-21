-- Policy explícita de "deny" em public.rate_limit_hits
--
-- A tabela foi criada em 20260421300000_server_rate_limit.sql com RLS ativa
-- e SEM nenhuma policy. Isso é correto em runtime (service_role bypassa RLS
-- e é o único que acessa a tabela, via RPC check_rate_limit() SECURITY
-- DEFINER). Porém o audit estático de RLS (scripts/audit-rls.mjs) exige
-- pelo menos uma policy declarada para documentar a intenção — sem ela
-- não é possível distinguir "esquecemos" de "é propositalmente fechada".
--
-- Aqui declaramos a policy de "acesso negado" para authenticated/anon.
-- service_role ignora RLS, então o rate-limit continua funcionando normal
-- pelas edge functions.

DO $$
BEGIN
  IF to_regclass('public.rate_limit_hits') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS rate_limit_hits_no_direct_access ON public.rate_limit_hits';
    EXECUTE $p$
      CREATE POLICY rate_limit_hits_no_direct_access
        ON public.rate_limit_hits
        FOR ALL
        TO authenticated, anon
        USING (false)
        WITH CHECK (false)
    $p$;
  END IF;
END
$$;

COMMENT ON POLICY rate_limit_hits_no_direct_access ON public.rate_limit_hits IS
  'Nega acesso direto via JWT. A tabela só deve ser escrita/lida pela RPC check_rate_limit() (SECURITY DEFINER) chamada com SUPABASE_SERVICE_ROLE_KEY nas edge functions.';
