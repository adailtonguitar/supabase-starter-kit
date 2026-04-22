-- ============================================================================
-- Persistência de QR Code oficial da NFC-e e URL de consulta SEFAZ
-- ============================================================================
-- Contexto:
-- O QR Code exibido no cupom NFC-e (DANFE simplificado) deve obedecer à
-- NT2015/002 e inclui a chave de acesso + parâmetros assinados pelo CSC.
-- Até esta migração, o frontend tentava sintetizar o QR no browser usando
-- `saleId` ou a chave crua, o que gera cupons SEM validade fiscal e expõe o
-- contribuinte a autuação da SEFAZ.
--
-- Esta migração é puramente ADITIVA:
--   • adiciona duas colunas NULL-ÁVEIS em public.fiscal_documents
--   • não reescreve registros existentes
--   • não altera RLS, triggers ou policies
-- Pode ser revertida com DROP COLUMN sem impacto em dados históricos.
-- ============================================================================

ALTER TABLE public.fiscal_documents
  ADD COLUMN IF NOT EXISTS qr_code_url text,
  ADD COLUMN IF NOT EXISTS url_consulta text;

COMMENT ON COLUMN public.fiscal_documents.qr_code_url IS
  'URL oficial a ser codificada no QR Code da NFC-e (NT2015/002). Fornecida pelo provedor fiscal após autorização da SEFAZ.';

COMMENT ON COLUMN public.fiscal_documents.url_consulta IS
  'URL humana do portal SEFAZ/UF para consulta da NFC-e por chave de acesso.';
