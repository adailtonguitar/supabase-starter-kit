-- Opt-in para inutilizacao automatica de gaps na numeracao fiscal.
-- Executado pela edge function auto-inutilize-gaps (agendamento recomendado:
-- dia 5 de cada mes). Por padrao desativado (false) para nao surpreender
-- empresas existentes — o admin habilita em Configuracoes Fiscais.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS auto_inutilize_gaps boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_inutilize_min_age_days integer NOT NULL DEFAULT 20
    CHECK (auto_inutilize_min_age_days BETWEEN 5 AND 60);

COMMENT ON COLUMN public.companies.auto_inutilize_gaps IS
  'Quando true, a function auto-inutilize-gaps processa automaticamente (mensalmente) lacunas de numeracao com no minimo auto_inutilize_min_age_days de idade. Emitindo INUTILIZACAO na SEFAZ.';
COMMENT ON COLUMN public.companies.auto_inutilize_min_age_days IS
  'Idade minima (em dias) de uma lacuna antes que seja candidata a inutilizacao automatica. Padrao 20 dias para dar margem a retries e conferencia manual.';

-- Log historico das inutilizacoes automaticas (append-only, retencao 5 anos).
CREATE TABLE IF NOT EXISTS public.fiscal_inutilization_logs (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid references public.companies(id) on delete restrict,
  doc_type        text not null check (doc_type in ('nfce', 'nfe')),
  serie           integer not null,
  numero_inicial  integer not null,
  numero_final    integer not null,
  justificativa   text not null,
  success         boolean not null,
  error_message   text,
  response        jsonb,
  created_at      timestamptz not null default now(),
  CONSTRAINT inut_range_valid CHECK (numero_final >= numero_inicial)
);

CREATE INDEX IF NOT EXISTS idx_inut_logs_company ON public.fiscal_inutilization_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_inut_logs_created ON public.fiscal_inutilization_logs(created_at DESC);

COMMENT ON TABLE public.fiscal_inutilization_logs IS
  'Historico append-only de inutilizacoes fiscais automaticas ou manuais. Retencao: 5 anos (comprovacao em fiscalizacao).';

-- RLS
ALTER TABLE public.fiscal_inutilization_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read inut logs" ON public.fiscal_inutilization_logs;
CREATE POLICY "Members read inut logs"
  ON public.fiscal_inutilization_logs
  FOR SELECT
  USING (
    company_id IN (
      SELECT cu.company_id FROM public.company_users cu
      WHERE cu.user_id = auth.uid() AND cu.is_active = true
    )
  );

DROP POLICY IF EXISTS "Service role inserts inut logs" ON public.fiscal_inutilization_logs;
CREATE POLICY "Service role inserts inut logs"
  ON public.fiscal_inutilization_logs
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Deny update inut logs" ON public.fiscal_inutilization_logs;
CREATE POLICY "Deny update inut logs"
  ON public.fiscal_inutilization_logs
  FOR UPDATE
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "Deny delete inut logs" ON public.fiscal_inutilization_logs;
CREATE POLICY "Deny delete inut logs"
  ON public.fiscal_inutilization_logs
  FOR DELETE
  USING (false);
