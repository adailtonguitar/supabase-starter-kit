-- Carrega linha de companies para o tenant atual sem depender de RLS em SELECT direto.
-- Corrige tela Cadastro > Empresa vazia quando policies em `companies` bloqueiam o REST.

CREATE OR REPLACE FUNCTION public.get_company_record(p_company_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT to_jsonb(c.*)
  FROM public.companies c
  WHERE c.id = p_company_id
    AND (
      EXISTS (
        SELECT 1
        FROM public.company_users cu
        WHERE cu.user_id = auth.uid()
          AND cu.company_id = p_company_id
          AND cu.is_active = true
      )
      OR EXISTS (
        SELECT 1
        FROM public.admin_roles ar
        WHERE ar.user_id = auth.uid()
          AND ar.role = 'super_admin'
      )
    )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_company_record(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_company_record(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_company_record(uuid) IS
  'Retorna JSON da empresa se o usuário é membro ativo (bypass RLS em companies).';
