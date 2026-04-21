-- ============================================================================
-- DB hardening + preparo para escalar (2026-04-21)
-- ----------------------------------------------------------------------------
-- Aplica correções de baixo risco e alto ROI apontadas pela auditoria:
--   S1  — fecha RLS de profiles (era aberto via USING(true))
--   S2  — restringe SELECT de feature_flags a super_admin
--   P1  — cria função current_user_company_ids() STABLE para policies futuras
--   P2  — cria índices compostos idempotentes em tabelas quentes
--          (sales, sale_items, products, financial_entries, nfe_documents)
--   Q3  — adiciona CHECK constraints em status onde estava text livre
--   S4  — corrige search_path em triggers que estavam sem
--
-- Todas as operações são idempotentes (IF NOT EXISTS / DROP ... IF EXISTS /
-- to_regclass) — rodar várias vezes é seguro.
-- ============================================================================

-- ───────────────────────────────────────────────────────────────────────────
-- S1: profiles — fecha SELECT aberto
-- ───────────────────────────────────────────────────────────────────────────
-- Detecta qual coluna usar como referência ao usuário: user_id (padrão novo)
-- ou id (padrão Supabase clássico, onde PK da profiles == auth.uid()).
DO $$
DECLARE
  v_col text;
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'user_id'
  ) THEN
    v_col := 'user_id';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'id'
  ) THEN
    v_col := 'id';
  ELSE
    RETURN; -- nada a fazer
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS "Profiles viewable by everyone" ON public.profiles';
  EXECUTE 'DROP POLICY IF EXISTS "profiles_select_self_or_colleagues" ON public.profiles';

  EXECUTE format($pol$
    CREATE POLICY "profiles_select_self_or_colleagues"
      ON public.profiles
      FOR SELECT
      TO authenticated
      USING (
        %1$I = auth.uid()
        OR %1$I IN (
          SELECT cu2.user_id
          FROM public.company_users cu1
          JOIN public.company_users cu2 ON cu2.company_id = cu1.company_id
          WHERE cu1.user_id = auth.uid()
            AND cu1.is_active = TRUE
            AND cu2.is_active = TRUE
        )
      )
  $pol$, v_col);
END$$;

-- ───────────────────────────────────────────────────────────────────────────
-- S2: feature_flags — SELECT só super_admin (interface pública é RPC)
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.feature_flags') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "feature_flags_select_all_auth" ON public.feature_flags';
    EXECUTE 'DROP POLICY IF EXISTS "feature_flags_select_anon" ON public.feature_flags';
    EXECUTE 'DROP POLICY IF EXISTS "feature_flags_select_super_admin" ON public.feature_flags';
    EXECUTE $q$
      CREATE POLICY "feature_flags_select_super_admin"
        ON public.feature_flags
        FOR SELECT
        TO authenticated
        USING (public.is_super_admin())
    $q$;
  END IF;
END$$;

-- ───────────────────────────────────────────────────────────────────────────
-- P1: função STABLE para uso em RLS policies futuras
-- ───────────────────────────────────────────────────────────────────────────
-- Só cria se ainda não existir (função atual pode estar em uso por policies,
-- dropar quebraria dependências). Objetivo aqui é garantir que exista.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'current_user_company_ids'
  ) THEN
    EXECUTE $f$
      CREATE FUNCTION public.current_user_company_ids()
      RETURNS uuid[]
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $body$
        SELECT COALESCE(array_agg(DISTINCT company_id), ARRAY[]::uuid[])
        FROM public.company_users
        WHERE user_id = auth.uid()
          AND is_active = TRUE
      $body$
    $f$;
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.current_user_company_ids() TO authenticated';
  END IF;
END$$;

-- ───────────────────────────────────────────────────────────────────────────
-- P2: índices compostos em tabelas quentes (só se existirem)
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_stmt text;
BEGIN
  -- sales(company_id, created_at DESC)
  IF to_regclass('public.sales') IS NOT NULL THEN
    v_stmt := 'CREATE INDEX IF NOT EXISTS idx_sales_company_created '
              || 'ON public.sales (company_id, created_at DESC)';
    EXECUTE v_stmt;
  END IF;

  -- sale_items(sale_id)
  IF to_regclass('public.sale_items') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON public.sale_items (sale_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_sale_items_product ON public.sale_items (product_id)';
  END IF;

  -- products(company_id, name)
  IF to_regclass('public.products') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_products_company_name ON public.products (company_id, name)';
    -- covering index parcial para o padrão do hook useProducts (is_active)
    BEGIN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_products_company_active '
              || 'ON public.products (company_id) WHERE is_active = TRUE';
    EXCEPTION WHEN undefined_column THEN
      -- coluna is_active pode não existir nessa base
      NULL;
    END;
  END IF;

  -- financial_entries(company_id, due_date)
  IF to_regclass('public.financial_entries') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_financial_entries_company_due '
            || 'ON public.financial_entries (company_id, due_date)';
  END IF;

  -- clients(company_id, name)
  IF to_regclass('public.clients') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_clients_company_name ON public.clients (company_id, name)';
  END IF;

  -- stock_movements(product_id, created_at DESC)
  IF to_regclass('public.stock_movements') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_stock_movements_product_created '
            || 'ON public.stock_movements (product_id, created_at DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_stock_movements_company_created '
            || 'ON public.stock_movements (company_id, created_at DESC)';
  END IF;

  -- cash_sessions(company_id, opened_at DESC)
  IF to_regclass('public.cash_sessions') IS NOT NULL THEN
    BEGIN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_cash_sessions_company_opened '
              || 'ON public.cash_sessions (company_id, opened_at DESC)';
    EXCEPTION WHEN undefined_column THEN
      NULL;
    END;
  END IF;

  -- nfe_documents: índice composto (company_id, data_emissao DESC) e status
  IF to_regclass('public.nfe_documents') IS NOT NULL THEN
    BEGIN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_nfe_documents_company_emissao '
              || 'ON public.nfe_documents (company_id, data_emissao DESC)';
    EXCEPTION WHEN undefined_column THEN
      NULL;
    END;
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_nfe_documents_company_status '
            || 'ON public.nfe_documents (company_id, status)';
  END IF;

  -- company_users: acelera a subquery usada em dezenas de policies
  IF to_regclass('public.company_users') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_company_users_user_active '
            || 'ON public.company_users (user_id) WHERE is_active = TRUE';
  END IF;

  -- ai_usage: queries por empresa + janela de tempo
  IF to_regclass('public.ai_usage') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_ai_usage_company_created '
            || 'ON public.ai_usage (company_id, created_at DESC)';
  END IF;

  -- error_events: consulta por support_code (support ticket flow)
  IF to_regclass('public.error_events') IS NOT NULL THEN
    BEGIN
      EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_error_events_support_code '
              || 'ON public.error_events (support_code) WHERE support_code IS NOT NULL';
    EXCEPTION WHEN undefined_column THEN
      NULL;
    END;
  END IF;
END$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Q3: CHECK constraints em colunas status (só se ainda não existe)
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.subscriptions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'subscriptions_status_check'
     ) THEN
    BEGIN
      EXECUTE $q$
        ALTER TABLE public.subscriptions
          ADD CONSTRAINT subscriptions_status_check
          CHECK (status IN ('active','trialing','past_due','canceled','unpaid','incomplete','paused','pending'))
          NOT VALID
      $q$;
    EXCEPTION WHEN others THEN
      -- Se houver valores fora dessa lista no legacy, deixa passar e
      -- alerta no log; o DBA pode validar manualmente depois.
      RAISE NOTICE 'subscriptions_status_check: nao aplicado (%).', SQLERRM;
    END;
  END IF;

  IF to_regclass('public.payments') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'payments_status_check'
     ) THEN
    BEGIN
      EXECUTE $q$
        ALTER TABLE public.payments
          ADD CONSTRAINT payments_status_check
          CHECK (status IN ('pending','authorized','paid','failed','refunded','chargeback','canceled','processing'))
          NOT VALID
      $q$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'payments_status_check: nao aplicado (%).', SQLERRM;
    END;
  END IF;
END$$;

-- ───────────────────────────────────────────────────────────────────────────
-- S4: search_path em triggers conhecidas sem ele
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'tg_feature_flags_touch') THEN
    ALTER FUNCTION public.tg_feature_flags_touch() SET search_path = public;
  END IF;
END$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Rollback hint (para caso precise reverter manualmente)
-- ───────────────────────────────────────────────────────────────────────────
-- DROP POLICY IF EXISTS "profiles_select_self_or_colleagues" ON public.profiles;
-- CREATE POLICY "Profiles viewable by everyone" ON public.profiles FOR SELECT USING (true);
-- DROP POLICY IF EXISTS "feature_flags_select_super_admin" ON public.feature_flags;
-- DROP FUNCTION IF EXISTS public.current_user_company_ids();
-- Indices idx_* podem ser droppados com DROP INDEX IF EXISTS nome;
