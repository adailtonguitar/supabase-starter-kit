-- ============================================================
-- FIX: Recursão infinita na RLS da tabela 'companies'
-- Problema: a policy de SELECT em companies fazia subquery em companies → loop infinito
-- Solução: SECURITY DEFINER functions que consultam company_users sem tocar em companies
--
-- EXECUTAR NO SUPABASE SQL EDITOR
-- ============================================================

-- 1) Criar função SECURITY DEFINER para verificar se o usuário pertence à empresa
CREATE OR REPLACE FUNCTION public.user_belongs_to_company(p_user_id uuid, p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_users
    WHERE user_id = p_user_id
      AND company_id = p_company_id
      AND is_active = true
  )
$$;

-- 2) Criar função que retorna todos os company_ids do usuário (para policies de SELECT)
CREATE OR REPLACE FUNCTION public.get_user_company_ids(p_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id
  FROM public.company_users
  WHERE user_id = p_user_id
    AND is_active = true
$$;

-- 3) Dropar policies antigas que causam recursão
DROP POLICY IF EXISTS "Users see own companies" ON public.companies;
DROP POLICY IF EXISTS "Users can view own companies" ON public.companies;
DROP POLICY IF EXISTS "Users can update own companies" ON public.companies;
DROP POLICY IF EXISTS "company_select_policy" ON public.companies;
DROP POLICY IF EXISTS "company_update_policy" ON public.companies;
DROP POLICY IF EXISTS "company_insert_policy" ON public.companies;

-- 4) Garantir que RLS está ativo
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- 5) SELECT: usar a SECURITY DEFINER function (sem recursão)
CREATE POLICY "companies_select_via_membership"
ON public.companies
FOR SELECT
TO authenticated
USING (
  id IN (SELECT public.get_user_company_ids(auth.uid()))
);

-- 6) UPDATE: apenas membros da empresa
CREATE POLICY "companies_update_via_membership"
ON public.companies
FOR UPDATE
TO authenticated
USING (
  public.user_belongs_to_company(auth.uid(), id)
)
WITH CHECK (
  public.user_belongs_to_company(auth.uid(), id)
);

-- 7) INSERT: qualquer autenticado pode criar empresa (onboarding)
CREATE POLICY "companies_insert_authenticated"
ON public.companies
FOR INSERT
TO authenticated
WITH CHECK (true);

-- 8) Permitir que super_admin veja todas as empresas (painel admin)
CREATE POLICY "companies_select_super_admin"
ON public.companies
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admin_roles
    WHERE user_id = auth.uid()
      AND role = 'super_admin'
  )
);
