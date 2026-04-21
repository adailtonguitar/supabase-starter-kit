-- ============================================================================
-- db-health-check.sql
-- ----------------------------------------------------------------------------
-- Cole este script no SQL Editor do Supabase para ter um panorama completo:
--   1. Tamanho das tabelas / índices
--   2. Tabelas sem RLS ou sem policy
--   3. FKs sem índice (causa sequential scans em joins)
--   4. Índices nunca usados (ocupam espaço e custam INSERT)
--   5. Queries mais caras (precisa da extensão pg_stat_statements)
--   6. Bloat estimado
--   7. Conexões ativas
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Top 20 tabelas por tamanho (heap + índices + toast)
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  schemaname || '.' || relname AS table_name,
  pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
  pg_size_pretty(pg_relation_size(c.oid))       AS heap_size,
  pg_size_pretty(pg_indexes_size(c.oid))        AS indexes_size,
  n_live_tup                                    AS live_rows,
  n_dead_tup                                    AS dead_rows
FROM pg_stat_user_tables
JOIN pg_class c ON c.relname = relname
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(c.oid) DESC
LIMIT 20;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Tabelas sem RLS habilitado no schema public
-- ────────────────────────────────────────────────────────────────────────────
SELECT n.nspname AS schema, c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname = 'public'
  AND NOT c.relrowsecurity
ORDER BY c.relname;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Tabelas com RLS habilitado MAS sem policies (= ninguém enxerga)
-- ────────────────────────────────────────────────────────────────────────────
SELECT n.nspname AS schema, c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname = 'public'
  AND c.relrowsecurity = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = n.nspname AND p.tablename = c.relname
  )
ORDER BY c.relname;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. FOREIGN KEYS SEM ÍNDICE (causa seq scans em joins — problema clássico)
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  tc.table_schema || '.' || tc.table_name AS table_name,
  kcu.column_name                         AS fk_column,
  tc.constraint_name                      AS fk_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema   = kcu.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema   = 'public'
  AND NOT EXISTS (
    SELECT 1
    FROM pg_indexes i
    WHERE i.schemaname = tc.table_schema
      AND i.tablename  = tc.table_name
      AND i.indexdef LIKE '%(' || kcu.column_name || '%'
  )
ORDER BY tc.table_name, kcu.column_name;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Índices NUNCA usados (candidatos a remoção)
--    OBS: espere pelo menos 30d de produção antes de confiar nisso
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  schemaname || '.' || relname AS table_name,
  indexrelname                 AS index_name,
  pg_size_pretty(pg_relation_size(i.indexrelid)) AS index_size,
  idx_scan
FROM pg_stat_user_indexes i
JOIN pg_index x ON x.indexrelid = i.indexrelid
WHERE schemaname = 'public'
  AND idx_scan = 0
  AND NOT x.indisunique
  AND NOT x.indisprimary
ORDER BY pg_relation_size(i.indexrelid) DESC;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. TOP 15 queries mais caras (precisa pg_stat_statements habilitado)
--    Se der erro: CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  substr(query, 1, 100) AS query_short,
  calls,
  ROUND(total_exec_time::numeric, 0)                    AS total_ms,
  ROUND(mean_exec_time::numeric, 2)                     AS mean_ms,
  ROUND((100 * total_exec_time / SUM(total_exec_time) OVER ())::numeric, 1) AS pct
FROM pg_stat_statements
WHERE query NOT ILIKE '%pg_stat_statements%'
  AND query NOT ILIKE 'EXPLAIN%'
ORDER BY total_exec_time DESC
LIMIT 15;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. Cache hit ratio (< 99% indica RAM insuficiente ou queries ruins)
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  'index hit rate' AS name,
  ROUND(
    (SUM(idx_blks_hit) / NULLIF(SUM(idx_blks_hit + idx_blks_read), 0))::numeric,
    4
  ) AS ratio
FROM pg_statio_user_indexes
UNION ALL
SELECT
  'table hit rate',
  ROUND(
    (SUM(heap_blks_hit) / NULLIF(SUM(heap_blks_hit + heap_blks_read), 0))::numeric,
    4
  )
FROM pg_statio_user_tables;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. Conexões ativas e estado
-- ────────────────────────────────────────────────────────────────────────────
SELECT state, COUNT(*) AS n, MAX(NOW() - query_start) AS longest_running
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY state
ORDER BY n DESC;

-- ────────────────────────────────────────────────────────────────────────────
-- 9. Tabelas que mais precisam VACUUM (dead_tuples / live_tuples)
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  schemaname || '.' || relname                         AS table_name,
  n_live_tup                                           AS live,
  n_dead_tup                                           AS dead,
  ROUND(n_dead_tup::numeric / NULLIF(n_live_tup, 0), 3) AS dead_ratio,
  last_autovacuum
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND n_live_tup > 1000
ORDER BY n_dead_tup DESC
LIMIT 15;

-- ────────────────────────────────────────────────────────────────────────────
-- 10. Políticas RLS por tabela (para revisão)
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
