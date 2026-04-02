-- Conservative RLS: companies (tenant root) + subscriptions (billing row per user).
-- Super admin (admin_roles.super_admin) keeps full access for Painel Admin com JWT do usuário.

-- ============================================================
-- 1) companies
-- ============================================================
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'companies' AND policyname = 'core_companies_select_member_or_super_admin'
  ) THEN
    EXECUTE $p$
      CREATE POLICY core_companies_select_member_or_super_admin
      ON public.companies
      FOR SELECT
      TO authenticated
      USING (
        id IN (
          SELECT cu.company_id FROM public.company_users cu
          WHERE cu.user_id = auth.uid() AND cu.is_active = true
        )
        OR EXISTS (
          SELECT 1 FROM public.admin_roles ar
          WHERE ar.user_id = auth.uid() AND ar.role = 'super_admin'
        )
      );
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'companies' AND policyname = 'core_companies_update_member_or_super_admin'
  ) THEN
    EXECUTE $p$
      CREATE POLICY core_companies_update_member_or_super_admin
      ON public.companies
      FOR UPDATE
      TO authenticated
      USING (
        id IN (
          SELECT cu.company_id FROM public.company_users cu
          WHERE cu.user_id = auth.uid() AND cu.is_active = true
        )
        OR EXISTS (
          SELECT 1 FROM public.admin_roles ar
          WHERE ar.user_id = auth.uid() AND ar.role = 'super_admin'
        )
      )
      WITH CHECK (
        id IN (
          SELECT cu.company_id FROM public.company_users cu
          WHERE cu.user_id = auth.uid() AND cu.is_active = true
        )
        OR EXISTS (
          SELECT 1 FROM public.admin_roles ar
          WHERE ar.user_id = auth.uid() AND ar.role = 'super_admin'
        )
      );
    $p$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'companies' AND policyname = 'core_companies_service_role_all'
  ) THEN
    EXECUTE $p$
      CREATE POLICY core_companies_service_role_all
      ON public.companies
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
    $p$;
  END IF;
END $$;

-- ============================================================
-- 2) subscriptions (fallback useSubscription: .eq("user_id", user.id))
-- ============================================================
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subscriptions' AND policyname = 'core_subscriptions_select_own_or_super_admin'
  ) THEN
    EXECUTE $p$
      CREATE POLICY core_subscriptions_select_own_or_super_admin
      ON public.subscriptions
      FOR SELECT
      TO authenticated
      USING (
        user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.admin_roles ar
          WHERE ar.user_id = auth.uid() AND ar.role = 'super_admin'
        )
      );
    $p$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subscriptions' AND policyname = 'core_subscriptions_service_role_all'
  ) THEN
    EXECUTE $p$
      CREATE POLICY core_subscriptions_service_role_all
      ON public.subscriptions
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
    $p$;
  END IF;
END $$;
