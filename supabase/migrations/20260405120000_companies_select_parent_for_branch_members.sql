-- Filial: membros só em company_users da filial não conseguiam SELECT na matriz.
-- O PDV roda getFiscalReadiness no browser e faz merge CNPJ/IE via parent_company_id;
-- sem esta policy o parent vem null e o erro "Informe o CNPJ" volta (Edge com service_role já funcionava).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'companies'
      AND policyname = 'core_companies_select_parent_of_member_branch'
  ) THEN
    EXECUTE $p$
      CREATE POLICY core_companies_select_parent_of_member_branch
      ON public.companies
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.company_users cu
          INNER JOIN public.companies child ON child.id = cu.company_id
          WHERE cu.user_id = auth.uid()
            AND cu.is_active = true
            AND child.parent_company_id IS NOT NULL
            AND child.parent_company_id = companies.id
        )
      );
    $p$;
  END IF;
END $$;
