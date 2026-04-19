-- ============================================================
-- BUCKET: company-backups (certificados A1/PFX + backups)
-- Privado, 10MB, PFX/PKCS12
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-backups',
  'company-backups',
  false,
  10485760, -- 10 MB
  ARRAY[
    'application/x-pkcs12',
    'application/pkcs12',
    'application/octet-stream',
    'application/json',
    'application/zip'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = GREATEST(storage.buckets.file_size_limit, 10485760),
  allowed_mime_types = ARRAY[
    'application/x-pkcs12',
    'application/pkcs12',
    'application/octet-stream',
    'application/json',
    'application/zip'
  ];

-- ============================================================
-- POLICIES — limpar versões antigas para idempotência
-- ============================================================
DROP POLICY IF EXISTS "company_backups_select_members" ON storage.objects;
DROP POLICY IF EXISTS "company_backups_insert_members" ON storage.objects;
DROP POLICY IF EXISTS "company_backups_update_members" ON storage.objects;
DROP POLICY IF EXISTS "company_backups_delete_members" ON storage.objects;

-- SELECT: membros ativos da empresa podem ler arquivos da pasta da própria empresa
CREATE POLICY "company_backups_select_members"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'company-backups'
  AND public.user_belongs_to_company(((storage.foldername(name))[1])::uuid)
);

-- INSERT
CREATE POLICY "company_backups_insert_members"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'company-backups'
  AND public.user_belongs_to_company(((storage.foldername(name))[1])::uuid)
);

-- UPDATE
CREATE POLICY "company_backups_update_members"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'company-backups'
  AND public.user_belongs_to_company(((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'company-backups'
  AND public.user_belongs_to_company(((storage.foldername(name))[1])::uuid)
);

-- DELETE
CREATE POLICY "company_backups_delete_members"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'company-backups'
  AND public.user_belongs_to_company(((storage.foldername(name))[1])::uuid)
);