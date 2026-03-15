-- ============================================================
-- Migração: Tabela dedicada user_roles (RBAC seguro)
-- Segue as melhores práticas de RLS sem recursão infinita.
-- ============================================================

-- 1) Criar enum de roles
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'gerente', 'supervisor', 'caixa');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) Tabela user_roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role      app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3) Função SECURITY DEFINER para checar role (sem recursão RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- 4) RLS policies para user_roles
CREATE POLICY "Users can view own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5) Migrar roles existentes de company_users para user_roles
-- (Executar apenas uma vez)
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT cu.user_id,
  CASE cu.role
    WHEN 'admin' THEN 'admin'::app_role
    WHEN 'gerente' THEN 'gerente'::app_role
    WHEN 'supervisor' THEN 'supervisor'::app_role
    ELSE 'caixa'::app_role
  END
FROM public.company_users cu
WHERE cu.is_active = true
ON CONFLICT (user_id, role) DO NOTHING;
