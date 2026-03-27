-- =============================================================================
-- EXECUTAR NO SUPABASE (SQL Editor) — migrations do repositorio
-- Ordem: session RPC grants -> fiscal_documents.sale_id
-- =============================================================================

-- --- supabase/migrations/20260322120000_session_rpc_grants.sql ---
-- invalidate_session: beforeunload usava Bearer anon -> 401 no PostgREST.
-- Cliente agora envia JWT do usuario; este GRANT cobre fallback e consistencia.
GRANT EXECUTE ON FUNCTION public.invalidate_session(TEXT) TO authenticated, anon;

-- --- supabase/migrations/20260327120000_fiscal_documents_sale_id.sql ---
-- Liga documentos fiscais a venda para a fila consultar/reconciliar sem emitir duplicada.
ALTER TABLE public.fiscal_documents
  ADD COLUMN IF NOT EXISTS sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fiscal_documents_sale_company
  ON public.fiscal_documents (company_id, sale_id)
  WHERE sale_id IS NOT NULL;

COMMENT ON COLUMN public.fiscal_documents.sale_id IS 'Venda PDV/origem — usado pela fila fiscal e reconciliacao.';
