
CREATE TABLE public.nfe_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  chave_nfe TEXT NOT NULL,
  numero INTEGER NOT NULL,
  serie INTEGER NOT NULL DEFAULT 1,
  modelo INTEGER NOT NULL DEFAULT 55,
  valor_total NUMERIC(15,2) NOT NULL DEFAULT 0,
  data_emissao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  xml_enviado TEXT,
  xml_autorizado TEXT,
  protocolo TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  nuvem_fiscal_id TEXT,
  sale_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.nfe_documents ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX idx_nfe_documents_chave ON public.nfe_documents (chave_nfe);
CREATE INDEX idx_nfe_documents_company ON public.nfe_documents (company_id);
CREATE INDEX idx_nfe_documents_emissao ON public.nfe_documents (data_emissao DESC);
CREATE INDEX idx_nfe_documents_status ON public.nfe_documents (status);

DROP POLICY IF EXISTS "Users can read own company nfe_documents" ON public.nfe_documents;
CREATE POLICY "Users can read own company nfe_documents"
  ON public.nfe_documents FOR SELECT TO authenticated
  USING (user_belongs_to_company(company_id));

DROP POLICY IF EXISTS "Users can insert own company nfe_documents" ON public.nfe_documents;
CREATE POLICY "Users can insert own company nfe_documents"
  ON public.nfe_documents FOR INSERT TO authenticated
  WITH CHECK (user_belongs_to_company(company_id));

DROP POLICY IF EXISTS "Users can update own company nfe_documents" ON public.nfe_documents;
CREATE POLICY "Users can update own company nfe_documents"
  ON public.nfe_documents FOR UPDATE TO authenticated
  USING (user_belongs_to_company(company_id));

DROP POLICY IF EXISTS "Service role full access nfe_documents" ON public.nfe_documents;
CREATE POLICY "Service role full access nfe_documents"
  ON public.nfe_documents FOR ALL TO service_role
  USING (true) WITH CHECK (true);
