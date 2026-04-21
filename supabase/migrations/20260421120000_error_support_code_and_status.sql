-- ============================================================
-- Self-service: código de suporte em erros + status page público
-- ============================================================
-- Motivação:
--   1) Hoje o usuário não consegue repassar um identificador curto
--      para o suporte quando encontra um erro. Com support_code,
--      o cliente copia um código e o suporte acha o erro na base.
--   2) A status page fica pública para que clientes vejam sozinhos
--      se o sistema está saudável, degradado ou fora — evitando
--      tickets "o sistema caiu?" quando é falha externa.
-- ============================================================

-- 1) support_code em system_errors
-- Formato: AS-YYYYMMDD-XXXX (ex: AS-20260421-7F3A). Curto e legível.

ALTER TABLE public.system_errors
  ADD COLUMN IF NOT EXISTS support_code text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_system_errors_support_code
  ON public.system_errors(support_code)
  WHERE support_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.generate_support_code()
RETURNS text
LANGUAGE sql VOLATILE
AS $$
  SELECT 'AS-' || to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDD') || '-' ||
    upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 4));
$$;

-- Trigger: preenche support_code na inserção quando NULL.
CREATE OR REPLACE FUNCTION public.tg_system_errors_support_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.support_code IS NULL THEN
    NEW.support_code := public.generate_support_code();
    -- Probabilidade de colisão é ínfima, mas garantimos via loop.
    WHILE EXISTS (SELECT 1 FROM public.system_errors WHERE support_code = NEW.support_code) LOOP
      NEW.support_code := public.generate_support_code();
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_system_errors_support_code ON public.system_errors;
CREATE TRIGGER trg_system_errors_support_code
  BEFORE INSERT ON public.system_errors
  FOR EACH ROW EXECUTE FUNCTION public.tg_system_errors_support_code();

COMMENT ON COLUMN public.system_errors.support_code IS
  'Código curto que o cliente copia para abrir suporte (AS-YYYYMMDD-XXXX).';

-- 2) RPC público mínimo para consultar status atual do sistema
-- Lê o último uptime_log e retorna apenas campos seguros (sem detalhes internos).

CREATE OR REPLACE FUNCTION public.get_public_system_status()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_last record;
  v_checks jsonb;
  v_failed_services text[];
BEGIN
  SELECT status, total_latency_ms, failed_services, created_at, checks
    INTO v_last
  FROM public.uptime_logs
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_last IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'unknown',
      'updated_at', NULL,
      'services', '[]'::jsonb
    );
  END IF;

  -- Normaliza checks sem expor mensagens de erro internas.
  IF v_last.checks IS NOT NULL THEN
    BEGIN
      v_checks := CASE
        WHEN jsonb_typeof(v_last.checks::jsonb) = 'array' THEN v_last.checks::jsonb
        ELSE '[]'::jsonb
      END;
    EXCEPTION WHEN others THEN
      v_checks := '[]'::jsonb;
    END;
  ELSE
    v_checks := '[]'::jsonb;
  END IF;

  -- Remove error strings para evitar vazar stack/detalhes.
  v_checks := (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'service', c->>'service',
        'status', c->>'status',
        'latency_ms', (c->>'latency_ms')::int
      )
    ), '[]'::jsonb)
    FROM jsonb_array_elements(v_checks) c
  );

  v_failed_services := COALESCE(v_last.failed_services, ARRAY[]::text[]);

  RETURN jsonb_build_object(
    'status', v_last.status,
    'updated_at', v_last.created_at,
    'total_latency_ms', v_last.total_latency_ms,
    'failed_services', to_jsonb(v_failed_services),
    'services', v_checks
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_system_status() TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_system_status() IS
  'Snapshot público do status do sistema (para página /status). Não expõe detalhes internos de erro.';

-- 3) RPC para o usuário logado consultar seu próprio erro via support_code
CREATE OR REPLACE FUNCTION public.lookup_support_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row record;
  v_uid uuid := auth.uid();
  v_is_admin boolean := public.is_super_admin();
BEGIN
  IF p_code IS NULL OR length(p_code) < 6 THEN
    RETURN jsonb_build_object('found', false, 'reason', 'invalid_code');
  END IF;

  SELECT id, user_id, user_email, page, action, error_message, created_at
    INTO v_row
  FROM public.system_errors
  WHERE support_code = upper(trim(p_code))
  LIMIT 1;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  -- Só retorna detalhe se for do próprio usuário ou admin.
  IF v_is_admin OR v_row.user_id = v_uid THEN
    RETURN jsonb_build_object(
      'found', true,
      'error_id', v_row.id,
      'page', v_row.page,
      'action', v_row.action,
      'created_at', v_row.created_at,
      'error_message', left(COALESCE(v_row.error_message, ''), 200)
    );
  END IF;

  -- Código válido mas pertence a outro usuário → confirma existência sem expor.
  RETURN jsonb_build_object(
    'found', true,
    'created_at', v_row.created_at,
    'restricted', true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_support_code(text) TO authenticated;
