-- Carta de Correcao Eletronica (CCe) — Ajuste SINIEF 07/2005, clausula decima-A.
-- Aplicavel apenas a NF-e (modelo 55). Prazo: 30 dias da autorizacao.
-- Maximo 20 sequenciais por NF-e (1..20).

CREATE TABLE IF NOT EXISTS public.fiscal_correction_letters (
  id               uuid primary key default gen_random_uuid(),
  fiscal_document_id uuid references public.fiscal_documents(id) on delete restrict,
  company_id       uuid references public.companies(id) on delete restrict,
  access_key       text,
  sequencial       integer not null check (sequencial between 1 and 20),
  correcao         text not null check (length(correcao) between 15 and 1000),
  protocol_number  text,
  provider_response jsonb,
  created_at       timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_cce_fiscal_document ON public.fiscal_correction_letters(fiscal_document_id);
CREATE INDEX IF NOT EXISTS idx_cce_company        ON public.fiscal_correction_letters(company_id);
CREATE INDEX IF NOT EXISTS idx_cce_access_key     ON public.fiscal_correction_letters(access_key);

-- Sequencial unico por documento
CREATE UNIQUE INDEX IF NOT EXISTS uq_cce_doc_seq
  ON public.fiscal_correction_letters(fiscal_document_id, sequencial)
  WHERE fiscal_document_id IS NOT NULL;

COMMENT ON TABLE public.fiscal_correction_letters IS
  'Historico de Cartas de Correcao Eletronicas (CCe) emitidas sobre NF-e 55. Retencao fiscal: 5 anos. RESTRICT para preservar log.';

-- Contador do ultimo sequencial emitido por NF-e (otimizacao de lookup).
ALTER TABLE public.fiscal_documents
  ADD COLUMN IF NOT EXISTS cce_last_sequence integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.fiscal_documents.cce_last_sequence IS
  'Ultimo sequencial de CCe emitido para esta NF-e (0 = nenhuma). Limite legal: 20.';

-- RLS basica: mesmo modelo de fiscal_documents (company members acessam).
ALTER TABLE public.fiscal_correction_letters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members of the company can read CCe" ON public.fiscal_correction_letters;
CREATE POLICY "Members of the company can read CCe"
  ON public.fiscal_correction_letters
  FOR SELECT
  USING (
    company_id IN (
      SELECT cu.company_id FROM public.company_users cu
      WHERE cu.user_id = auth.uid() AND cu.is_active = true
    )
  );

DROP POLICY IF EXISTS "Service role can insert CCe" ON public.fiscal_correction_letters;
CREATE POLICY "Service role can insert CCe"
  ON public.fiscal_correction_letters
  FOR INSERT
  WITH CHECK (true);

-- Deny delete/update para usuarios normais (retencao fiscal).
DROP POLICY IF EXISTS "Deny update CCe" ON public.fiscal_correction_letters;
CREATE POLICY "Deny update CCe"
  ON public.fiscal_correction_letters
  FOR UPDATE
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "Deny delete CCe" ON public.fiscal_correction_letters;
CREATE POLICY "Deny delete CCe"
  ON public.fiscal_correction_letters
  FOR DELETE
  USING (false);
