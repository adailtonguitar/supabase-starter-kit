-- ⚠️ OBSOLETO — Use sql/fix_storage_company_assets_rls.sql
-- Este arquivo original tinha policies sem filtro por tenant (vulnerabilidade cross-tenant).
-- A correção está em: sql/fix_storage_company_assets_rls.sql

-- 1. Criar o bucket (público para leitura de logos)
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-assets', 'company-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- As policies foram corrigidas em fix_storage_company_assets_rls.sql
-- com filtro por company_id no path do arquivo.
