-- =============================================
-- SISTEMA DE PLANOS SaaS - AnthOS
-- Execute este SQL no Supabase SQL Editor
-- =============================================

-- 1) Enum de planos
DO $$ BEGIN
  CREATE TYPE public.plan_tier AS ENUM ('emissor', 'starter', 'business', 'pro');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.subscription_status AS ENUM ('active', 'suspended', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.financial_level AS ENUM ('basic', 'full');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) Tabela company_plans (por empresa, não por usuário)
CREATE TABLE IF NOT EXISTS public.company_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan plan_tier NOT NULL DEFAULT 'starter',
  status subscription_status NOT NULL DEFAULT 'active',
  max_users INT NOT NULL DEFAULT 1,
  fiscal_enabled BOOLEAN NOT NULL DEFAULT false,
  advanced_reports_enabled BOOLEAN NOT NULL DEFAULT false,
  financial_module_level financial_level NOT NULL DEFAULT 'basic',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

ALTER TABLE public.company_plans ENABLE ROW LEVEL SECURITY;

-- RLS: empresa pode ler seu próprio plano
CREATE POLICY "Users can read own company plan" ON public.company_plans
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT cu.company_id FROM public.company_users cu
      WHERE cu.user_id = auth.uid() AND cu.is_active = true
    )
  );

-- Super admins podem gerenciar todos os planos
CREATE POLICY "Super admins manage all plans" ON public.company_plans
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'super_admin'
    )
  );

-- 3) Função SECURITY DEFINER para validar limites no backend
CREATE OR REPLACE FUNCTION public.check_plan_limit(
  p_company_id UUID,
  p_feature TEXT -- 'add_user', 'fiscal', 'advanced_reports', 'financial_full'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan RECORD;
  v_current_users INT;
BEGIN
  SELECT * INTO v_plan FROM public.company_plans
  WHERE company_id = p_company_id AND status = 'active'
  LIMIT 1;

  -- Sem plano = starter defaults
  IF NOT FOUND THEN
    IF p_feature = 'fiscal' THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'Plano Starter não inclui emissão fiscal.');
    ELSIF p_feature = 'advanced_reports' THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'Plano Starter não inclui relatórios avançados.');
    ELSIF p_feature = 'financial_full' THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'Plano Starter possui financeiro limitado.');
    ELSIF p_feature = 'add_user' THEN
      SELECT COUNT(*) INTO v_current_users FROM public.company_users WHERE company_id = p_company_id AND is_active = true;
      IF v_current_users >= 1 THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'Plano Starter permite apenas 1 usuário.');
      END IF;
    END IF;
    RETURN jsonb_build_object('allowed', true);
  END IF;

  -- Plano expirado?
  IF v_plan.expires_at IS NOT NULL AND v_plan.expires_at < now() THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Assinatura expirada. Renove para continuar.');
  END IF;

  -- Verificações por feature
  IF p_feature = 'add_user' THEN
    SELECT COUNT(*) INTO v_current_users FROM public.company_users WHERE company_id = p_company_id AND is_active = true;
    IF v_plan.max_users > 0 AND v_current_users >= v_plan.max_users THEN
      RETURN jsonb_build_object('allowed', false, 'reason',
        format('Seu plano permite no máximo %s usuário(s). Atual: %s.', v_plan.max_users, v_current_users));
    END IF;
  ELSIF p_feature = 'fiscal' THEN
    IF NOT v_plan.fiscal_enabled THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'Seu plano não inclui emissão fiscal. Faça upgrade.');
    END IF;
  ELSIF p_feature = 'advanced_reports' THEN
    IF NOT v_plan.advanced_reports_enabled THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'Seu plano não inclui relatórios avançados. Faça upgrade.');
    END IF;
  ELSIF p_feature = 'financial_full' THEN
    IF v_plan.financial_module_level != 'full' THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'Financeiro completo requer plano Pro.');
    END IF;
  END IF;

  RETURN jsonb_build_object('allowed', true);
END;
$$;

-- 4) Inserir plano starter default para empresas existentes que não têm plano
INSERT INTO public.company_plans (company_id, plan, status, max_users, fiscal_enabled, advanced_reports_enabled, financial_module_level)
SELECT c.id, 'starter', 'active', 1, false, false, 'basic'
FROM public.companies c
WHERE NOT EXISTS (SELECT 1 FROM public.company_plans cp WHERE cp.company_id = c.id)
ON CONFLICT (company_id) DO NOTHING;
