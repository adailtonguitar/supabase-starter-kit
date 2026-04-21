-- ============================================================================
-- RPC de saúde/integridade do banco (snapshot rápido e barato)
-- ----------------------------------------------------------------------------
-- Motivação:
--   Backup só vale se você consegue perceber quando ele FALHA.
--   Esse RPC dá uma fotografia instantânea de:
--     - contagem (estimada) de linhas em tabelas críticas do negócio
--     - tamanho total do banco (monitorar crescimento)
--     - contagem de conexões ativas (detectar leak)
--     - última execução do purge de retenção (detectar cron parado)
--     - última hora do erro crítico mais recente
--   Serve como "canary": se companies/sales/fiscal_documents caírem de repente
--   ou a contagem de conexões explodir, o operador vê na hora.
--
--   Usa pg_class.reltuples (estimativa atualizada pelo autovacuum) — é instantâneo
--   mesmo em tabelas grandes. Precisão: ±5% após ANALYZE.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_db_health_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_counts           jsonb := '{}'::jsonb;
  v_db_size          bigint;
  v_connections      integer;
  v_connections_max  integer;
  v_last_purge_at    timestamptz;
  v_last_purge_ok    boolean;
  v_last_critical    timestamptz;
  v_critical_tables  text[] := ARRAY[
    'companies',
    'company_users',
    'profiles',
    'sales',
    'sale_items',
    'products',
    'clients',
    'suppliers',
    'financial_entries',
    'stock_movements',
    'fiscal_documents',
    'fiscal_queue',
    'nfe_imports',
    'subscriptions',
    'payments',
    'company_plans',
    'user_sessions'
  ];
  v_table            text;
  v_estimate         bigint;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Estimativa por tabela (rápido)
  FOREACH v_table IN ARRAY v_critical_tables LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      SELECT GREATEST(reltuples::bigint, 0)
        INTO v_estimate
        FROM pg_class
        WHERE oid = ('public.' || v_table)::regclass;
      v_counts := v_counts || jsonb_build_object(v_table, v_estimate);
    END IF;
  END LOOP;

  -- Tamanho do banco
  SELECT pg_database_size(current_database()) INTO v_db_size;

  -- Conexões ativas
  SELECT COUNT(*), current_setting('max_connections')::int
    INTO v_connections, v_connections_max
    FROM pg_stat_activity
    WHERE datname = current_database();

  -- Último purge (se já rodou)
  IF to_regclass('public.retention_log') IS NOT NULL THEN
    SELECT executed_at, (result->>'ok')::boolean
      INTO v_last_purge_at, v_last_purge_ok
      FROM public.retention_log
      ORDER BY executed_at DESC
      LIMIT 1;
  END IF;

  -- Último erro crítico (se tabela existir)
  IF to_regclass('public.system_errors') IS NOT NULL THEN
    BEGIN
      EXECUTE 'SELECT MAX(created_at) FROM public.system_errors WHERE severity = $1'
        INTO v_last_critical
        USING 'critical';
    EXCEPTION WHEN undefined_column THEN
      v_last_critical := NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok',               TRUE,
    'checked_at',       NOW(),
    'database_size',    v_db_size,
    'database_size_pretty', pg_size_pretty(v_db_size),
    'connections',      v_connections,
    'connections_max',  v_connections_max,
    'connections_pct',  ROUND((v_connections::numeric / NULLIF(v_connections_max, 0)) * 100, 1),
    'last_purge_at',    v_last_purge_at,
    'last_purge_ok',    v_last_purge_ok,
    'last_critical_error_at', v_last_critical,
    'table_counts',     v_counts
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'ok',    FALSE,
    'error', SQLERRM
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_db_health_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_db_health_snapshot() TO authenticated;

COMMENT ON FUNCTION public.get_db_health_snapshot() IS
  'Snapshot rápido (usa reltuples, não COUNT): contagens estimadas de tabelas críticas,
   tamanho do banco, conexões ativas, última limpeza de retenção e último erro crítico.
   Restrito a super_admin. Serve como canary para detectar corrupção/perda de dados.';
