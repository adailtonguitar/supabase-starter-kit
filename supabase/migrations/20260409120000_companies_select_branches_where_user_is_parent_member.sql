-- Matriz: usuário membro só da empresa-pai não via SELECT em filiais (parent_company_id = pai).
-- A tela Filiais e queries .in('parent_company_id', ids) ficavam vazias; só existia policy filial→matriz.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'companies'
      AND policyname = 'core_companies_select_branch_if_parent_member'
  ) THEN
    EXECUTE $p$
      CREATE POLICY core_companies_select_branch_if_parent_member
      ON public.companies
      FOR SELECT
      TO authenticated
      USING (
        parent_company_id IS NOT NULL
        AND parent_company_id IN (
          SELECT cu.company_id
          FROM public.company_users cu
          WHERE cu.user_id = auth.uid()
            AND cu.is_active = true
        )
      );
    $p$;
  END IF;
END $$;
