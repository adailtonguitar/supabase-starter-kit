-- Fonte de verdade para vínculo usuário↔empresa sem depender de RLS em SELECT em company_users.
-- SECURITY DEFINER + apenas auth.uid() — não aceita parâmetro de user (evita spoofing).
-- Usada pelo app para resolver empresa ativa e para decidir onboarding vs dashboard.

CREATE OR REPLACE FUNCTION public.get_my_company_memberships()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'company_id', cu.company_id,
          'is_active', cu.is_active
        )
        ORDER BY cu.created_at ASC NULLS LAST
      )
      FROM public.company_users cu
      WHERE cu.user_id = auth.uid()
    ),
    '[]'::jsonb
  );
$$;

REVOKE ALL ON FUNCTION public.get_my_company_memberships() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_company_memberships() TO authenticated;

COMMENT ON FUNCTION public.get_my_company_memberships() IS
  'Lista vínculos do usuário autenticado (bypass RLS). Usado para bootstrap de sessão e onboarding.';
