-- Conservative SaaS hardening: baseline multi-tenant RLS by company_id.
-- Goal: prevent cross-company data leaks while keeping app behavior intact.

-- Helper predicate pattern:
-- company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid() AND cu.is_active = true)

-- ============================================================
-- 1) company_users (membership + role protection baseline)
-- ============================================================
ALTER TABLE public.company_users ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'company_users' AND policyname = 'core_company_users_select_membership'
  ) THEN
    EXECUTE $p$
      CREATE POLICY core_company_users_select_membership
      ON public.company_users
      FOR SELECT
      TO authenticated
      USING (
        company_id IN (
          SELECT cu2.company_id
          FROM public.company_users cu2
          WHERE cu2.user_id = auth.uid() AND cu2.is_active = true
        )
      );
    $p$;
  END IF;

  -- Insert/delete/update of memberships is admin-only (conservative default).
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'company_users' AND policyname = 'core_company_users_insert_admin'
  ) THEN
    EXECUTE $p$
      CREATE POLICY core_company_users_insert_admin
      ON public.company_users
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.company_users cu
          WHERE cu.user_id = auth.uid()
            AND cu.company_id = company_id
            AND cu.role = 'admin'
            AND cu.is_active = true
        )
      );
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'company_users' AND policyname = 'core_company_users_delete_admin_not_self'
  ) THEN
    EXECUTE $p$
      CREATE POLICY core_company_users_delete_admin_not_self
      ON public.company_users
      FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.company_users cu
          WHERE cu.user_id = auth.uid()
            AND cu.company_id = public.company_users.company_id
            AND cu.role = 'admin'
            AND cu.is_active = true
        )
        AND user_id <> auth.uid()
      );
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'company_users' AND policyname = 'core_company_users_update_admin_not_self'
  ) THEN
    EXECUTE $p$
      CREATE POLICY core_company_users_update_admin_not_self
      ON public.company_users
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.company_users cu
          WHERE cu.user_id = auth.uid()
            AND cu.company_id = public.company_users.company_id
            AND cu.role = 'admin'
            AND cu.is_active = true
        )
        AND user_id <> auth.uid()
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.company_users cu
          WHERE cu.user_id = auth.uid()
            AND cu.company_id = public.company_users.company_id
            AND cu.role = 'admin'
            AND cu.is_active = true
        )
        AND user_id <> auth.uid()
      );
    $p$;
  END IF;
END $$;

-- Service role: operational access (webhooks, background jobs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'company_users' AND policyname = 'core_company_users_service_role_all'
  ) THEN
    EXECUTE $p$
      CREATE POLICY core_company_users_service_role_all
      ON public.company_users
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
    $p$;
  END IF;
END $$;

-- ============================================================
-- 2) sales
-- ============================================================
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sales' AND policyname = 'core_sales_select_company_members'
  ) THEN
    EXECUTE $p$
      CREATE POLICY core_sales_select_company_members
      ON public.sales
      FOR SELECT
      TO authenticated
      USING (
        company_id IN (
          SELECT cu.company_id FROM public.company_users cu
          WHERE cu.user_id = auth.uid() AND cu.is_active = true
        )
      );
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sales' AND policyname = 'core_sales_write_company_members'
  ) THEN
    EXECUTE $p$
      CREATE POLICY core_sales_write_company_members
      ON public.sales
      FOR INSERT
      TO authenticated
      WITH CHECK (
        company_id IN (
          SELECT cu.company_id FROM public.company_users cu
          WHERE cu.user_id = auth.uid() AND cu.is_active = true
        )
      );
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sales' AND policyname = 'core_sales_update_company_members'
  ) THEN
    EXECUTE $p$
      CREATE POLICY core_sales_update_company_members
      ON public.sales
      FOR UPDATE
      TO authenticated
      USING (
        company_id IN (
          SELECT cu.company_id FROM public.company_users cu
          WHERE cu.user_id = auth.uid() AND cu.is_active = true
        )
      )
      WITH CHECK (
        company_id IN (
          SELECT cu.company_id FROM public.company_users cu
          WHERE cu.user_id = auth.uid() AND cu.is_active = true
        )
      );
    $p$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sales' AND policyname = 'core_sales_service_role_all'
  ) THEN
    EXECUTE $p$
      CREATE POLICY core_sales_service_role_all
      ON public.sales
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
    $p$;
  END IF;
END $$;

-- ============================================================
-- 3) products
-- ============================================================
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'core_products_select_company_members'
  ) THEN
    EXECUTE $p$
      CREATE POLICY core_products_select_company_members
      ON public.products
      FOR SELECT
      TO authenticated
      USING (
        company_id IN (
          SELECT cu.company_id FROM public.company_users cu
          WHERE cu.user_id = auth.uid() AND cu.is_active = true
        )
      );
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'core_products_write_company_members'
  ) THEN
    EXECUTE $p$
      CREATE POLICY core_products_write_company_members
      ON public.products
      FOR INSERT
      TO authenticated
      WITH CHECK (
        company_id IN (
          SELECT cu.company_id FROM public.company_users cu
          WHERE cu.user_id = auth.uid() AND cu.is_active = true
        )
      );
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'core_products_update_company_members'
  ) THEN
    EXECUTE $p$
      CREATE POLICY core_products_update_company_members
      ON public.products
      FOR UPDATE
      TO authenticated
      USING (
        company_id IN (
          SELECT cu.company_id FROM public.company_users cu
          WHERE cu.user_id = auth.uid() AND cu.is_active = true
        )
      )
      WITH CHECK (
        company_id IN (
          SELECT cu.company_id FROM public.company_users cu
          WHERE cu.user_id = auth.uid() AND cu.is_active = true
        )
      );
    $p$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'core_products_service_role_all'
  ) THEN
    EXECUTE $p$
      CREATE POLICY core_products_service_role_all
      ON public.products
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
    $p$;
  END IF;
END $$;

-- ============================================================
-- 4) clients
-- ============================================================
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'clients' AND policyname = 'core_clients_select_company_members'
  ) THEN
    EXECUTE $p$
      CREATE POLICY core_clients_select_company_members
      ON public.clients
      FOR SELECT
      TO authenticated
      USING (
        company_id IN (
          SELECT cu.company_id FROM public.company_users cu
          WHERE cu.user_id = auth.uid() AND cu.is_active = true
        )
      );
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'clients' AND policyname = 'core_clients_write_company_members'
  ) THEN
    EXECUTE $p$
      CREATE POLICY core_clients_write_company_members
      ON public.clients
      FOR INSERT
      TO authenticated
      WITH CHECK (
        company_id IN (
          SELECT cu.company_id FROM public.company_users cu
          WHERE cu.user_id = auth.uid() AND cu.is_active = true
        )
      );
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'clients' AND policyname = 'core_clients_update_company_members'
  ) THEN
    EXECUTE $p$
      CREATE POLICY core_clients_update_company_members
      ON public.clients
      FOR UPDATE
      TO authenticated
      USING (
        company_id IN (
          SELECT cu.company_id FROM public.company_users cu
          WHERE cu.user_id = auth.uid() AND cu.is_active = true
        )
      )
      WITH CHECK (
        company_id IN (
          SELECT cu.company_id FROM public.company_users cu
          WHERE cu.user_id = auth.uid() AND cu.is_active = true
        )
      );
    $p$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'clients' AND policyname = 'core_clients_service_role_all'
  ) THEN
    EXECUTE $p$
      CREATE POLICY core_clients_service_role_all
      ON public.clients
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
    $p$;
  END IF;
END $$;

-- ============================================================
-- 5) financial_entries
-- ============================================================
ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'financial_entries' AND policyname = 'core_financial_entries_select_company_members'
  ) THEN
    EXECUTE $p$
      CREATE POLICY core_financial_entries_select_company_members
      ON public.financial_entries
      FOR SELECT
      TO authenticated
      USING (
        company_id IN (
          SELECT cu.company_id FROM public.company_users cu
          WHERE cu.user_id = auth.uid() AND cu.is_active = true
        )
      );
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'financial_entries' AND policyname = 'core_financial_entries_write_company_members'
  ) THEN
    EXECUTE $p$
      CREATE POLICY core_financial_entries_write_company_members
      ON public.financial_entries
      FOR INSERT
      TO authenticated
      WITH CHECK (
        company_id IN (
          SELECT cu.company_id FROM public.company_users cu
          WHERE cu.user_id = auth.uid() AND cu.is_active = true
        )
      );
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'financial_entries' AND policyname = 'core_financial_entries_update_company_members'
  ) THEN
    EXECUTE $p$
      CREATE POLICY core_financial_entries_update_company_members
      ON public.financial_entries
      FOR UPDATE
      TO authenticated
      USING (
        company_id IN (
          SELECT cu.company_id FROM public.company_users cu
          WHERE cu.user_id = auth.uid() AND cu.is_active = true
        )
      )
      WITH CHECK (
        company_id IN (
          SELECT cu.company_id FROM public.company_users cu
          WHERE cu.user_id = auth.uid() AND cu.is_active = true
        )
      );
    $p$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'financial_entries' AND policyname = 'core_financial_entries_service_role_all'
  ) THEN
    EXECUTE $p$
      CREATE POLICY core_financial_entries_service_role_all
      ON public.financial_entries
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
    $p$;
  END IF;
END $$;

-- ============================================================
-- 6) fiscal_documents (core fiscal linkage by company_id)
-- ============================================================
ALTER TABLE public.fiscal_documents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'fiscal_documents' AND policyname = 'core_fiscal_documents_select_company_members'
  ) THEN
    EXECUTE $p$
      CREATE POLICY core_fiscal_documents_select_company_members
      ON public.fiscal_documents
      FOR SELECT
      TO authenticated
      USING (
        company_id IN (
          SELECT cu.company_id FROM public.company_users cu
          WHERE cu.user_id = auth.uid() AND cu.is_active = true
        )
      );
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'fiscal_documents' AND policyname = 'core_fiscal_documents_write_company_members'
  ) THEN
    EXECUTE $p$
      CREATE POLICY core_fiscal_documents_write_company_members
      ON public.fiscal_documents
      FOR INSERT
      TO authenticated
      WITH CHECK (
        company_id IN (
          SELECT cu.company_id FROM public.company_users cu
          WHERE cu.user_id = auth.uid() AND cu.is_active = true
        )
      );
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'fiscal_documents' AND policyname = 'core_fiscal_documents_update_company_members'
  ) THEN
    EXECUTE $p$
      CREATE POLICY core_fiscal_documents_update_company_members
      ON public.fiscal_documents
      FOR UPDATE
      TO authenticated
      USING (
        company_id IN (
          SELECT cu.company_id FROM public.company_users cu
          WHERE cu.user_id = auth.uid() AND cu.is_active = true
        )
      )
      WITH CHECK (
        company_id IN (
          SELECT cu.company_id FROM public.company_users cu
          WHERE cu.user_id = auth.uid() AND cu.is_active = true
        )
      );
    $p$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'fiscal_documents' AND policyname = 'core_fiscal_documents_service_role_all'
  ) THEN
    EXECUTE $p$
      CREATE POLICY core_fiscal_documents_service_role_all
      ON public.fiscal_documents
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
    $p$;
  END IF;
END $$;

