-- 1. Criar o bucket (público para leitura de logos)
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-assets', 'company-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Política: usuários autenticados podem fazer upload
CREATE POLICY "Authenticated users can upload company assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'company-assets');

-- 3. Política: usuários autenticados podem atualizar (upsert)
CREATE POLICY "Authenticated users can update company assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'company-assets');

-- 4. Política: leitura pública (bucket já é público, mas garante)
CREATE POLICY "Public read access for company assets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'company-assets');

-- 5. Política: usuários autenticados podem deletar seus assets
CREATE POLICY "Authenticated users can delete company assets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'company-assets');
