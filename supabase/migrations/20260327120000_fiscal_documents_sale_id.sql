-- Liga documentos fiscais à venda para a fila consultar/reconciliar sem emitir duplicada.
ALTER TABLE public.fiscal_documents
  ADD COLUMN IF NOT EXISTS sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fiscal_documents_sale_company
  ON public.fiscal_documents (company_id, sale_id)
  WHERE sale_id IS NOT NULL;

COMMENT ON COLUMN public.fiscal_documents.sale_id IS 'Venda PDV/origem — usado pela fila fiscal e reconciliação.';
