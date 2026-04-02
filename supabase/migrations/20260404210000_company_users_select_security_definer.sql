-- Evita 500 em REST (products/sales/companies) por recursão RLS em company_users:
-- policies em outras tabelas leem company_users; EXISTS aninhado em company_users
-- pode estourar avaliação. Função SECURITY DEFINER lê memberships sem reaplicar RLS.

CREATE OR REPLACE FUNCTION public.current_user_company_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT cu.company_id
  FROM public.company_users cu
  WHERE cu.user_id = auth.uid()
    AND cu.is_active = true;
$$;

REVOKE ALL ON FUNCTION public.current_user_company_ids() FROM public;
GRANT EXECUTE ON FUNCTION public.current_user_company_ids() TO authenticated;

COMMENT ON FUNCTION public.current_user_company_ids() IS
  'IDs de empresas ativas do usuário; usado em RLS para evitar subquery recursiva em company_users.';

DROP POLICY IF EXISTS core_company_users_select_membership ON public.company_users;

CREATE POLICY core_company_users_select_membership
  ON public.company_users
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR company_id IN (SELECT public.current_user_company_ids())
  );
