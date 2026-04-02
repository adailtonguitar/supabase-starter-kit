-- ============================================================
-- Auditoria de RLS no schema public (rodar no Supabase SQL Editor)
-- Uso: colar e executar como role com visão total (postgres / dashboard).
-- Não cria objetos; só consulta catálogo.
--
-- Depois de aplicar migrations, use também a (3) para ver o que ainda
-- falta para o “pacote automático” (company_id NOT NULL, RLS off).
-- ============================================================

-- 1) Todas as tabelas base em public: RLS ligado? quantas policies?
SELECT
  n.nspname AS schema,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  (
    SELECT count(*)::int
    FROM pg_policies p
    WHERE p.schemaname = n.nspname
      AND p.tablename = c.relname
  ) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relrowsecurity ASC, c.relname;

-- 2) Prioridade alta: tem coluna company_id mas RLS desligado (vazamento multi-tenant provável)
SELECT c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND NOT c.relrowsecurity
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns col
    WHERE col.table_schema = 'public'
      AND col.table_name = c.relname
      AND col.column_name = 'company_id'
  )
ORDER BY c.relname;

-- 3) Próximo candidato à migration auto (mesmo critério de 20260402133000_core_company_rls_auto_remaining.sql)
SELECT c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN information_schema.columns col
  ON col.table_schema = 'public'
 AND col.table_name = c.relname
 AND col.column_name = 'company_id'
 AND col.is_nullable = 'NO'
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND NOT c.relrowsecurity
ORDER BY c.relname;
