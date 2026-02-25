-- =============================================
-- CONTROLE DE SESSÕES - Anti-compartilhamento
-- Execute este SQL no Supabase SQL Editor
-- =============================================

-- 1) Tabela user_sessions
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  device_info TEXT,
  ip_address TEXT,
  session_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_active ON public.user_sessions(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON public.user_sessions(session_token);

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- RLS: users can only see their own sessions
CREATE POLICY "Users see own sessions" ON public.user_sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- RLS: users can update their own sessions (for heartbeat)
CREATE POLICY "Users update own sessions" ON public.user_sessions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 2) Function to get max sessions per plan (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_max_sessions_for_user(p_user_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_plan TEXT;
  v_is_super_admin BOOLEAN;
BEGIN
  -- Check if user is super_admin → unlimited sessions
  SELECT EXISTS(
    SELECT 1 FROM public.admin_roles
    WHERE user_id = p_user_id AND role = 'super_admin'
  ) INTO v_is_super_admin;

  IF v_is_super_admin THEN
    RETURN 0; -- unlimited
  END IF;

  -- Get user's company
  SELECT company_id INTO v_company_id
  FROM public.company_users
  WHERE user_id = p_user_id AND is_active = true
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RETURN 1;
  END IF;

  -- Get company plan
  SELECT plan::TEXT INTO v_plan
  FROM public.company_plans
  WHERE company_id = v_company_id AND status = 'active'
  LIMIT 1;

  IF v_plan IS NULL OR v_plan = 'starter' THEN
    RETURN 1;
  ELSIF v_plan = 'business' THEN
    RETURN 3;
  ELSIF v_plan = 'pro' THEN
    RETURN 0;
  END IF;

  RETURN 1;
END;
$$;

-- 3) Function to register session (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.register_session(
  p_user_id UUID,
  p_company_id UUID,
  p_session_token TEXT,
  p_device_info TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_sessions INT;
  v_active_count INT;
  v_oldest_session_id UUID;
BEGIN
  -- Get max sessions for plan
  v_max_sessions := public.get_max_sessions_for_user(p_user_id);

  -- Invalidate sessions older than 24h
  UPDATE public.user_sessions
  SET is_active = false
  WHERE user_id = p_user_id
    AND is_active = true
    AND last_activity < now() - INTERVAL '24 hours';

  -- Count active sessions
  SELECT COUNT(*) INTO v_active_count
  FROM public.user_sessions
  WHERE user_id = p_user_id AND is_active = true;

  -- If unlimited (pro), just insert
  IF v_max_sessions = 0 THEN
    INSERT INTO public.user_sessions (user_id, company_id, session_token, device_info, ip_address)
    VALUES (p_user_id, p_company_id, p_session_token, p_device_info, p_ip_address);
    RETURN jsonb_build_object('success', true, 'action', 'created');
  END IF;

  -- If at limit, invalidate oldest session
  IF v_active_count >= v_max_sessions THEN
    SELECT id INTO v_oldest_session_id
    FROM public.user_sessions
    WHERE user_id = p_user_id AND is_active = true
    ORDER BY last_activity ASC
    LIMIT 1;

    IF v_oldest_session_id IS NOT NULL THEN
      UPDATE public.user_sessions SET is_active = false WHERE id = v_oldest_session_id;
    END IF;
  END IF;

  -- Insert new session
  INSERT INTO public.user_sessions (user_id, company_id, session_token, device_info, ip_address)
  VALUES (p_user_id, p_company_id, p_session_token, p_device_info, p_ip_address);

  RETURN jsonb_build_object(
    'success', true,
    'action', CASE WHEN v_active_count >= v_max_sessions THEN 'replaced_oldest' ELSE 'created' END,
    'max_sessions', v_max_sessions
  );
END;
$$;

-- 4) Function to validate session is still active
CREATE OR REPLACE FUNCTION public.validate_session(p_session_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
BEGIN
  SELECT * INTO v_session
  FROM public.user_sessions
  WHERE session_token = p_session_token AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Sessão invalidada. Outro dispositivo pode ter feito login.');
  END IF;

  -- Update heartbeat
  UPDATE public.user_sessions
  SET last_activity = now()
  WHERE id = v_session.id;

  RETURN jsonb_build_object('valid', true);
END;
$$;

-- 5) Function to invalidate session on logout
CREATE OR REPLACE FUNCTION public.invalidate_session(p_session_token TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_sessions
  SET is_active = false
  WHERE session_token = p_session_token;
END;
$$;

-- 6) Cleanup: auto-invalidate stale sessions (> 24h inactive)
-- Can be called via pg_cron or manually
CREATE OR REPLACE FUNCTION public.cleanup_stale_sessions()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.user_sessions
  SET is_active = false
  WHERE is_active = true AND last_activity < now() - INTERVAL '24 hours';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
