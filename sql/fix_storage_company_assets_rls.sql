-- ============================================================
-- FIX: Storage company-assets — restringir write/delete ao tenant owner
-- Antes: qualquer usuário autenticado podia manipular assets de qualquer empresa
-- Depois: apenas membros ativos da empresa podem upload/update/delete seus assets
--
-- EXECUTAR NO SUPABASE SQL EDITOR
-- ============================================================

-- Drop all existing overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can upload company assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update company assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete company assets" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for company assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can only manage own company assets" ON storage.objects;

-- 1) Public read (bucket is public for logos — acceptable)
CREATE POLICY "Public read company assets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'company-assets');

-- 2) INSERT: only members of the company (first folder = company_id)
CREATE POLICY "Members can upload own company assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'company-assets'
  AND (storage.foldername(name))[1] IN (
    SELECT cu.company_id::text
    FROM public.company_users cu
    WHERE cu.user_id = auth.uid()
      AND cu.is_active = true
  )
);

-- 3) UPDATE: only members of the company
CREATE POLICY "Members can update own company assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'company-assets'
  AND (storage.foldername(name))[1] IN (
    SELECT cu.company_id::text
    FROM public.company_users cu
    WHERE cu.user_id = auth.uid()
      AND cu.is_active = true
  )
);

-- 4) DELETE: only members of the company
CREATE POLICY "Members can delete own company assets"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'company-assets'
  AND (storage.foldername(name))[1] IN (
    SELECT cu.company_id::text
    FROM public.company_users cu
    WHERE cu.user_id = auth.uid()
      AND cu.is_active = true
  )
);
