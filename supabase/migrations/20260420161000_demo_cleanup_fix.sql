-- ============================================================================
-- FIX: cleanup_expired_demo_companies estava pegando empresas de teste
-- que o admin marcou manualmente como is_demo=true (ex: "ar cell bairro 1").
--
-- Nova regra: só limpa empresas cujos USUÁRIOS vinculados SÃO TODOS
-- do botão automático (email @demo.anthosystem.com). Empresas is_demo
-- com usuários reais ficam preservadas para auditoria.
-- ============================================================================

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
  v_orfaos_cleaned int := 0;
  v_has_real_user boolean;
BEGIN
  -- Só pega empresas que foram CRIADAS pelo botão demo (is_demo=true +
  -- TODOS os usuários vinculados têm email @demo.anthosystem.com) E que
  -- já expiraram (7+ dias OU plano expirado).
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
       -- TODOS os users dessa empresa são demo automáticos
       AND EXISTS (
         SELECT 1 FROM public.company_users cu
          WHERE cu.company_id = c.id
       )
       AND NOT EXISTS (
         SELECT 1
           FROM public.company_users cu
           JOIN auth.users u ON u.id = cu.user_id
          WHERE cu.company_id = c.id
            AND u.email NOT LIKE 'demo_%@demo.anthosystem.com'
       )
  LOOP
    -- Double-check: nenhum usuário real vinculado
    SELECT EXISTS (
      SELECT 1
        FROM public.company_users cu
        JOIN auth.users u ON u.id = cu.user_id
       WHERE cu.company_id = v_company.id
         AND u.email NOT LIKE 'demo_%@demo.anthosystem.com'
    ) INTO v_has_real_user;

    IF v_has_real_user THEN
      CONTINUE; -- segurança extra
    END IF;

    -- Coleta user_ids da empresa
    FOR v_user_id IN
      SELECT cu.user_id
        FROM public.company_users cu
       WHERE cu.company_id = v_company.id
    LOOP
      -- Só deleta se não estiver em nenhuma outra empresa
      IF NOT EXISTS (
        SELECT 1 FROM public.company_users cu2
         WHERE cu2.user_id = v_user_id
           AND cu2.company_id <> v_company.id
      ) THEN
        -- Antes do DELETE da empresa: limpa filhos que não têm ON DELETE CASCADE
        -- (cash_sessions, e outros que possam aparecer no futuro — logamos se falhar)
        BEGIN
          DELETE FROM public.cash_sessions WHERE company_id = v_company.id;
        EXCEPTION WHEN OTHERS THEN
          -- ignora se tabela não existe / outro erro
          NULL;
        END;

        DELETE FROM auth.users WHERE id = v_user_id;
        v_users_deleted := v_users_deleted + 1;
      END IF;
    END LOOP;

    -- Limpa filhos sem CASCADE ANTES do delete da empresa
    BEGIN
      DELETE FROM public.cash_sessions WHERE company_id = v_company.id;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    DELETE FROM public.companies WHERE id = v_company.id;
    v_companies_deleted := v_companies_deleted + 1;
  END LOOP;

  -- Limpa rate limit antigo
  DELETE FROM public.demo_account_attempts
   WHERE created_at < now() - interval '7 days';
  GET DIAGNOSTICS v_attempts_cleaned = ROW_COUNT;

  -- Limpa users demo órfãos (sem empresa) — identificador no email
  WITH demo_orfaos AS (
    SELECT u.id
      FROM auth.users u
     WHERE u.email LIKE 'demo_%@demo.anthosystem.com'
       AND NOT EXISTS (
         SELECT 1 FROM public.company_users cu WHERE cu.user_id = u.id
       )
  )
  DELETE FROM auth.users WHERE id IN (SELECT id FROM demo_orfaos);
  GET DIAGNOSTICS v_orfaos_cleaned = ROW_COUNT;
  v_users_deleted := v_users_deleted + v_orfaos_cleaned;

  RETURN jsonb_build_object(
    'executed_at', now(),
    'companies_deleted', v_companies_deleted,
    'users_deleted', v_users_deleted,
    'orfaos_cleaned', v_orfaos_cleaned,
    'rate_limit_records_cleaned', v_attempts_cleaned
  );
END;
$$;

COMMENT ON FUNCTION public.cleanup_expired_demo_companies IS
  'Deleta APENAS empresas demo criadas pelo botão automático (users @demo.anthosystem.com) com +7 dias OU plano expirado. Preserva empresas is_demo marcadas manualmente pelo admin.';
