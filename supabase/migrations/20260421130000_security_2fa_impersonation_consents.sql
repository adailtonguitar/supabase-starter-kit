-- =====================================================================
-- Task #6 - Security hardening
--   1. Admin security settings (require MFA for super_admin)
--   2. Impersonation audit log
--   3. Versioned legal documents + per-user consent history
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. admin_security_settings (single-row config table)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_security_settings (
  id boolean PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE),
  require_mfa_for_super_admin boolean NOT NULL DEFAULT TRUE,
  require_mfa_for_company_owner boolean NOT NULL DEFAULT FALSE,
  impersonation_max_minutes int NOT NULL DEFAULT 60,
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  updated_by uuid REFERENCES auth.users(id)
);

INSERT INTO public.admin_security_settings (id)
VALUES (TRUE)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.admin_security_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_security_settings_select ON public.admin_security_settings;
CREATE POLICY admin_security_settings_select ON public.admin_security_settings
  FOR SELECT TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS admin_security_settings_update ON public.admin_security_settings;
CREATE POLICY admin_security_settings_update ON public.admin_security_settings
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Helper: is current user enrolled in an active (verified) MFA factor?
CREATE OR REPLACE FUNCTION public.current_user_has_mfa()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.mfa_factors
    WHERE user_id = auth.uid()
      AND status = 'verified'
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_user_has_mfa() TO authenticated;

-- ---------------------------------------------------------------------
-- 2. impersonation_logs (audit trail for super_admin "login as company")
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.impersonation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  ip_address text,
  user_agent text,
  started_at timestamptz NOT NULL DEFAULT NOW(),
  ended_at timestamptz,
  actions_count int NOT NULL DEFAULT 0,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_impersonation_logs_admin ON public.impersonation_logs(admin_user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_impersonation_logs_company ON public.impersonation_logs(target_company_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_impersonation_logs_open ON public.impersonation_logs(started_at DESC) WHERE ended_at IS NULL;

ALTER TABLE public.impersonation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS impersonation_logs_admin_all ON public.impersonation_logs;
CREATE POLICY impersonation_logs_admin_all ON public.impersonation_logs
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Start an impersonation session (super_admin only, with MFA).
-- Cria (ou reativa) membership temporária `company_users.role = 'super_admin_impersonator'`
-- para que RLS existente conceda acesso à empresa alvo. A membership é marcada
-- como inactive em end_impersonation e auditada em impersonation_logs.
CREATE OR REPLACE FUNCTION public.start_impersonation(
  p_target_company_id uuid,
  p_target_user_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_id uuid;
  v_require_mfa boolean;
  v_company_name text;
BEGIN
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden: only super_admin can impersonate';
  END IF;

  IF p_target_company_id IS NULL THEN
    RAISE EXCEPTION 'target_company_id required';
  END IF;

  SELECT require_mfa_for_super_admin
    INTO v_require_mfa
    FROM public.admin_security_settings
    WHERE id = TRUE;

  IF COALESCE(v_require_mfa, TRUE) AND NOT public.current_user_has_mfa() THEN
    RAISE EXCEPTION 'mfa_required: enroll 2FA before impersonating';
  END IF;

  -- Ative (ou crie) membership temporária para o super_admin na empresa alvo
  INSERT INTO public.company_users (company_id, user_id, role, is_active)
  VALUES (p_target_company_id, v_admin, 'super_admin_impersonator', TRUE)
  ON CONFLICT (company_id, user_id)
  DO UPDATE SET is_active = TRUE, role = 'super_admin_impersonator', updated_at = NOW();

  INSERT INTO public.impersonation_logs (
    admin_user_id, target_company_id, target_user_id, reason, ip_address, user_agent
  ) VALUES (
    v_admin, p_target_company_id, p_target_user_id, p_reason, p_ip, p_user_agent
  ) RETURNING id INTO v_id;

  SELECT name INTO v_company_name FROM public.companies WHERE id = p_target_company_id;

  RETURN jsonb_build_object(
    'log_id', v_id,
    'company_id', p_target_company_id,
    'company_name', v_company_name,
    'started_at', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_impersonation(uuid, uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.end_impersonation(p_log_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_company uuid;
  v_admin uuid := auth.uid();
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.impersonation_logs
     SET ended_at = COALESCE(ended_at, NOW())
   WHERE id = p_log_id
     AND admin_user_id = v_admin
  RETURNING target_company_id INTO v_target_company;

  -- Desative a membership temporária criada em start_impersonation
  IF v_target_company IS NOT NULL THEN
    UPDATE public.company_users
       SET is_active = FALSE, updated_at = NOW()
     WHERE company_id = v_target_company
       AND user_id = v_admin
       AND role = 'super_admin_impersonator';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.end_impersonation(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 3. legal_documents + user_consents (versioned)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.legal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('terms','privacy','contract_saas','fiscal_terms')),
  version text NOT NULL,
  title text NOT NULL,
  content_hash text,
  content_url text,
  summary text,
  published_at timestamptz NOT NULL DEFAULT NOW(),
  is_active boolean NOT NULL DEFAULT FALSE,
  created_by uuid REFERENCES auth.users(id),
  UNIQUE (kind, version)
);

CREATE INDEX IF NOT EXISTS idx_legal_documents_active ON public.legal_documents(kind) WHERE is_active;

ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS legal_documents_select_all ON public.legal_documents;
CREATE POLICY legal_documents_select_all ON public.legal_documents
  FOR SELECT TO anon, authenticated
  USING (TRUE);

DROP POLICY IF EXISTS legal_documents_admin_write ON public.legal_documents;
CREATE POLICY legal_documents_admin_write ON public.legal_documents
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Seed current active versions (idempotent)
INSERT INTO public.legal_documents (kind, version, title, summary, is_active)
VALUES
  ('terms',        '1.0', 'Termos de Uso',                 'Versão inicial dos Termos de Uso',         TRUE),
  ('privacy',      '1.0', 'Política de Privacidade',       'Versão inicial da Política de Privacidade',TRUE),
  ('contract_saas','1.0', 'Contrato SaaS',                 'Versão inicial do Contrato SaaS',          TRUE),
  ('fiscal_terms', '1.0', 'Termos Fiscais',                'Versão inicial dos Termos Fiscais',        TRUE)
ON CONFLICT (kind, version) DO NOTHING;

-- Ensure only one active per kind (set others to false when activating one)
CREATE OR REPLACE FUNCTION public.tg_legal_documents_single_active()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_active THEN
    UPDATE public.legal_documents
       SET is_active = FALSE
     WHERE kind = NEW.kind
       AND id <> NEW.id
       AND is_active = TRUE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_legal_documents_single_active ON public.legal_documents;
CREATE TRIGGER trg_legal_documents_single_active
  AFTER INSERT OR UPDATE OF is_active ON public.legal_documents
  FOR EACH ROW
  WHEN (NEW.is_active)
  EXECUTE FUNCTION public.tg_legal_documents_single_active();

-- User consents history (append-only)
CREATE TABLE IF NOT EXISTS public.user_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  document_id uuid NOT NULL REFERENCES public.legal_documents(id) ON DELETE RESTRICT,
  kind text NOT NULL,
  version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT NOW(),
  ip_address text,
  user_agent text,
  UNIQUE (user_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_user_consents_user_kind ON public.user_consents(user_id, kind, accepted_at DESC);

ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_consents_select_own ON public.user_consents;
CREATE POLICY user_consents_select_own ON public.user_consents
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin());

DROP POLICY IF EXISTS user_consents_insert_self ON public.user_consents;
CREATE POLICY user_consents_insert_self ON public.user_consents
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- RPC: get current pending consents for the user (active doc version not yet accepted)
CREATE OR REPLACE FUNCTION public.get_pending_consents()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_user IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'document_id', ld.id,
    'kind', ld.kind,
    'version', ld.version,
    'title', ld.title,
    'summary', ld.summary,
    'published_at', ld.published_at
  ) ORDER BY ld.kind), '[]'::jsonb)
  INTO v_result
  FROM public.legal_documents ld
  WHERE ld.is_active = TRUE
    AND NOT EXISTS (
      SELECT 1 FROM public.user_consents uc
      WHERE uc.user_id = v_user
        AND uc.document_id = ld.id
    );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_consents() TO authenticated;

-- RPC: accept a pending document (records consent + mirrors into terms_acceptance for backward compat)
CREATE OR REPLACE FUNCTION public.accept_legal_document(
  p_document_id uuid,
  p_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_doc public.legal_documents%ROWTYPE;
  v_company uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_doc FROM public.legal_documents WHERE id = p_document_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'document_not_found';
  END IF;

  -- best-effort: attach user's current company
  SELECT company_id INTO v_company
    FROM public.company_users
    WHERE user_id = v_user
    ORDER BY created_at DESC NULLS LAST
    LIMIT 1;

  INSERT INTO public.user_consents (
    user_id, company_id, document_id, kind, version, ip_address, user_agent
  ) VALUES (
    v_user, v_company, v_doc.id, v_doc.kind, v_doc.version, p_ip, p_user_agent
  )
  ON CONFLICT (user_id, document_id) DO NOTHING;

  -- backward compat with existing terms_acceptance table
  IF v_doc.kind = 'terms' THEN
    BEGIN
      INSERT INTO public.terms_acceptance (company_id, user_id, ip_address, user_agent, terms_version)
      VALUES (v_company, v_user, p_ip, p_user_agent, v_doc.version);
    EXCEPTION WHEN OTHERS THEN
      -- silently ignore: mirror is best-effort and must never break consent recording
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'kind', v_doc.kind,
    'version', v_doc.version
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_legal_document(uuid, text, text) TO authenticated;

COMMENT ON TABLE public.admin_security_settings IS 'Global security toggles (MFA, impersonation limits).';
COMMENT ON TABLE public.impersonation_logs       IS 'Audit trail of super_admin impersonation sessions.';
COMMENT ON TABLE public.legal_documents          IS 'Versioned legal documents (terms, privacy, contract, fiscal).';
COMMENT ON TABLE public.user_consents            IS 'Append-only history of user consents to legal documents.';
