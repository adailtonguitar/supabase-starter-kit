-- ============================================================================
-- Auditoria de public.admin_roles
-- ============================================================================
-- A tabela admin_roles controla quem tem super_admin. Hoje, qualquer mudança
-- acontece silenciosamente. Um ataque / erro humano criando um novo super_admin
-- passaria despercebido por dias.
--
-- Esta migration adiciona:
--   1. Tabela imutável admin_role_audit (append-only)
--   2. Trigger AFTER INSERT/UPDATE/DELETE em admin_roles
--   3. Notificação externa assíncrona (Discord/Slack/Telegram) via pg_net
--      quando alguém vira/deixa de ser super_admin — alerta crítico e imediato
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admin_role_audit (
  id            bigserial PRIMARY KEY,
  event_type    text NOT NULL CHECK (event_type IN ('INSERT','UPDATE','DELETE')),
  actor_id      uuid NULL,                 -- quem executou (auth.uid() ou NULL se sistema)
  target_user_id uuid NOT NULL,            -- usuário cujo role foi mudado
  old_role      text NULL,
  new_role      text NULL,
  ip            text NULL,                 -- via current_setting('request.headers')
  user_agent    text NULL,
  metadata      jsonb NULL,
  created_at    timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_role_audit_created
  ON public.admin_role_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_role_audit_target
  ON public.admin_role_audit (target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_role_audit_actor
  ON public.admin_role_audit (actor_id, created_at DESC);

ALTER TABLE public.admin_role_audit ENABLE ROW LEVEL SECURITY;

-- Só super_admin lê. Ninguém nunca INSERT/UPDATE/DELETE direto (só trigger).
DROP POLICY IF EXISTS admin_role_audit_select_super ON public.admin_role_audit;
CREATE POLICY admin_role_audit_select_super
  ON public.admin_role_audit FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

COMMENT ON TABLE public.admin_role_audit IS
  'Append-only audit de admin_roles. Todos INSERT/UPDATE/DELETE capturados via trigger. Leitura restrita a super_admin.';

-- ============================================================================
-- Helpers para extrair IP e UA de PostgREST (melhor esforço)
-- ============================================================================
CREATE OR REPLACE FUNCTION public._req_header(header_name text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_raw text;
BEGIN
  BEGIN
    v_raw := current_setting('request.headers', true);
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
  IF v_raw IS NULL OR v_raw = '' THEN
    RETURN NULL;
  END IF;
  RETURN (v_raw::jsonb ->> header_name);
END;
$$;

-- ============================================================================
-- Trigger: registra mudanças e dispara alerta externo em eventos críticos
-- ============================================================================
CREATE OR REPLACE FUNCTION public.tg_admin_roles_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, extensions
AS $$
DECLARE
  v_actor_id        uuid;
  v_event_type      text;
  v_target_user_id  uuid;
  v_old_role        text;
  v_new_role        text;
  v_is_critical     boolean := false;
  v_ip              text;
  v_ua              text;
  v_payload         jsonb;
  v_functions_url   text;
  v_service_key     text;
BEGIN
  v_actor_id := auth.uid();
  v_ip := public._req_header('x-forwarded-for');
  v_ua := public._req_header('user-agent');

  IF TG_OP = 'INSERT' THEN
    v_event_type := 'INSERT';
    v_target_user_id := NEW.user_id;
    v_old_role := NULL;
    v_new_role := NEW.role;
    v_is_critical := (NEW.role = 'super_admin');
  ELSIF TG_OP = 'UPDATE' THEN
    v_event_type := 'UPDATE';
    v_target_user_id := NEW.user_id;
    v_old_role := OLD.role;
    v_new_role := NEW.role;
    v_is_critical := (NEW.role = 'super_admin' OR OLD.role = 'super_admin');
  ELSE -- DELETE
    v_event_type := 'DELETE';
    v_target_user_id := OLD.user_id;
    v_old_role := OLD.role;
    v_new_role := NULL;
    v_is_critical := (OLD.role = 'super_admin');
  END IF;

  INSERT INTO public.admin_role_audit (
    event_type, actor_id, target_user_id, old_role, new_role, ip, user_agent, metadata
  ) VALUES (
    v_event_type, v_actor_id, v_target_user_id, v_old_role, v_new_role, v_ip, v_ua,
    jsonb_build_object('table', TG_TABLE_NAME, 'timestamp', NOW())
  );

  -- Alerta externo só em eventos críticos (super_admin envolvido)
  -- Best-effort: se pg_net ou settings não existirem, só ignora.
  IF v_is_critical THEN
    BEGIN
      v_functions_url := current_setting('app.settings.supabase_functions_url', true);
      v_service_key   := current_setting('app.settings.service_role_key', true);

      IF v_functions_url IS NOT NULL AND v_service_key IS NOT NULL THEN
        v_payload := jsonb_build_object(
          'event_type',     v_event_type,
          'actor_id',       v_actor_id,
          'target_user_id', v_target_user_id,
          'old_role',       v_old_role,
          'new_role',       v_new_role,
          'ip',             v_ip,
          'user_agent',     v_ua,
          'at',             NOW()
        );

        PERFORM net.http_post(
          url     := v_functions_url || '/notify-admin-role-change',
          body    := v_payload,
          headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || v_service_key
          )
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Não falhar a operação se o alerta externo der ruim
      RAISE WARNING '[admin_role_audit] notify webhook failed: %', SQLERRM;
    END;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_roles_audit ON public.admin_roles;
CREATE TRIGGER trg_admin_roles_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.admin_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_admin_roles_audit();

COMMENT ON FUNCTION public.tg_admin_roles_audit() IS
  'Registra mudanças em admin_roles na tabela admin_role_audit e dispara alerta externo (Discord/Slack/Telegram) quando super_admin é criado/removido/alterado.';

-- ============================================================================
-- RPC: get_admin_role_audit(limit, offset) - usado pela UI
-- ============================================================================
-- Retorna audit junto com e-mail do actor/target pra UI ficar legível,
-- sem precisar o client fazer join separado no profiles.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_admin_role_audit(
  p_limit  int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id              bigint,
  event_type      text,
  actor_id        uuid,
  actor_email     text,
  target_user_id  uuid,
  target_email    text,
  old_role        text,
  new_role        text,
  ip              text,
  user_agent      text,
  created_at      timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden: super_admin required';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.event_type,
    a.actor_id,
    au_actor.email::text  AS actor_email,
    a.target_user_id,
    au_target.email::text AS target_email,
    a.old_role,
    a.new_role,
    a.ip,
    a.user_agent,
    a.created_at
  FROM public.admin_role_audit a
  LEFT JOIN auth.users au_actor  ON au_actor.id  = a.actor_id
  LEFT JOIN auth.users au_target ON au_target.id = a.target_user_id
  ORDER BY a.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_role_audit(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_role_audit(int, int) TO authenticated;

COMMENT ON FUNCTION public.get_admin_role_audit(int, int) IS
  'Retorna audit de admin_roles com emails resolvidos. Guard: super_admin.';
