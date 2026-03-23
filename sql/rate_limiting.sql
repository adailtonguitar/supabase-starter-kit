-- ============================================================
-- Rate Limiting: tabela + função RPC para throttle por tenant
-- ============================================================

-- Tabela para registrar chamadas por função/tenant
CREATE TABLE IF NOT EXISTS rate_limit_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  fn_name    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índice para consulta rápida por função + tenant + janela de tempo
CREATE INDEX IF NOT EXISTS idx_rate_limit_log_lookup
  ON rate_limit_log (fn_name, company_id, created_at DESC);

-- Limpeza automática: apagar registros com mais de 1 hora (evita crescimento)
SELECT cron.schedule(
  'cleanup-rate-limit-log',
  '*/10 * * * *',
  $$DELETE FROM rate_limit_log WHERE created_at < now() - INTERVAL '1 hour'$$
);

-- RPC: check_rate_limit
-- Retorna true se dentro do limite, false se excedido.
-- Registra a chamada atomicamente.
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_company_id uuid,
  p_fn_name    text,
  p_max_calls  int,
  p_window_sec int DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  -- Contar chamadas na janela
  SELECT count(*) INTO v_count
  FROM rate_limit_log
  WHERE fn_name = p_fn_name
    AND company_id = p_company_id
    AND created_at > now() - (p_window_sec || ' seconds')::interval;

  IF v_count >= p_max_calls THEN
    RETURN false;
  END IF;

  -- Registrar esta chamada
  INSERT INTO rate_limit_log (company_id, fn_name)
  VALUES (p_company_id, p_fn_name);

  RETURN true;
END;
$$;
