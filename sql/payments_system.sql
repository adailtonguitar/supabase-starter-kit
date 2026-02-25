-- =============================================
-- SISTEMA DE PAGAMENTOS E RENOVAÇÃO - AnthOS
-- Execute este SQL no Supabase SQL Editor
-- =============================================

-- 1) Tabela payments
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  plan_key TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  method TEXT, -- 'pix', 'credit_card', 'boleto', 'mp_balance'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'refunded'
  transaction_id TEXT UNIQUE,
  mp_preference_id TEXT,
  mp_payment_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_company ON public.payments(company_id);
CREATE INDEX IF NOT EXISTS idx_payments_transaction ON public.payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payments_mp_payment ON public.payments(mp_payment_id);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Users can see their company's payments
DROP POLICY IF EXISTS "Users see own company payments" ON public.payments;
CREATE POLICY "Users see own company payments" ON public.payments
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT cu.company_id FROM public.company_users cu
      WHERE cu.user_id = auth.uid() AND cu.is_active = true
    )
  );

-- Super admins can see all
DROP POLICY IF EXISTS "Super admins manage payments" ON public.payments;
CREATE POLICY "Super admins manage payments" ON public.payments
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

-- 2) Function to process approved payment (SECURITY DEFINER - called by webhook)
CREATE OR REPLACE FUNCTION public.process_payment_approval(
  p_mp_payment_id TEXT,
  p_transaction_id TEXT,
  p_method TEXT,
  p_amount NUMERIC,
  p_user_id UUID,
  p_plan_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_payment_id UUID;
  v_existing_payment UUID;
BEGIN
  -- Idempotency: check if already processed
  SELECT id INTO v_existing_payment
  FROM public.payments
  WHERE mp_payment_id = p_mp_payment_id AND status = 'approved';
  
  IF v_existing_payment IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'action', 'already_processed', 'payment_id', v_existing_payment);
  END IF;

  -- Get user's company
  SELECT company_id INTO v_company_id
  FROM public.company_users
  WHERE user_id = p_user_id AND is_active = true
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Empresa não encontrada para o usuário.');
  END IF;

  -- Insert payment record
  INSERT INTO public.payments (company_id, user_id, plan_key, amount, method, status, transaction_id, mp_payment_id)
  VALUES (v_company_id, p_user_id, p_plan_key, p_amount, p_method, 'approved', p_transaction_id, p_mp_payment_id)
  RETURNING id INTO v_payment_id;

  -- Update subscription: extend 30 days from now (or from current expiry if still active)
  UPDATE public.subscriptions
  SET status = 'active',
      subscription_end = GREATEST(
        now() + INTERVAL '30 days',
        COALESCE(subscription_end, now()) + INTERVAL '30 days'
      ),
      plan_key = p_plan_key,
      updated_at = now()
  WHERE user_id = p_user_id;

  -- If no subscription exists, create one
  IF NOT FOUND THEN
    INSERT INTO public.subscriptions (user_id, plan_key, status, subscription_end, created_at)
    VALUES (p_user_id, p_plan_key, 'active', now() + INTERVAL '30 days', now());
  END IF;

  RETURN jsonb_build_object('success', true, 'action', 'approved', 'payment_id', v_payment_id, 'company_id', v_company_id);
END;
$$;
