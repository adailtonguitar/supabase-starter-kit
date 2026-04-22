-- ============================================================================
-- Retenção fiscal: bloquear DELETE em cascata de empresa para tabelas fiscais
-- ============================================================================
-- Contexto:
-- A legislação brasileira exige retenção mínima de 5 anos de documentos fiscais
-- eletrônicos (NF-e, NFC-e, NFS-e, eventos, arquivos SPED, XMLs recebidos).
-- Hoje, `notas_recebidas` e `nfe_documents` usam `ON DELETE CASCADE` para
-- `companies`, o que significa que um `DELETE FROM companies WHERE id = X`
-- silenciosamente apaga todo o acervo fiscal — risco de multa pesada em
-- fiscalização SPED.
--
-- Esta migração:
--   1. Troca FK CASCADE → RESTRICT nas tabelas com retenção obrigatória.
--   2. Deixa admin_delete_company ainda funcional: a função já apaga os
--      filhos explicitamente ANTES de apagar a empresa (ordem manual).
--   3. Com RESTRICT, qualquer DELETE direto em `companies` sem passar por
--      admin_delete_company vai falhar com `foreign_key_violation`, forçando
--      o operador a usar o fluxo oficial (com confirmação e/ou arquivamento).
--
-- Tabelas afetadas: notas_recebidas, nfe_documents.
-- Tabelas mantidas em CASCADE (sem retenção obrigatória):
--   company_users, fiscal_configs, dfe_sync_control, fiscal_cert_alerts_sent,
--   dunning (todas são metadata de configuração/operação, não documento fiscal)
--
-- Segurança: totalmente reversível — basta re-executar ALTER para CASCADE.
-- Não altera dados, não bloqueia writes, não muda RLS.
-- ============================================================================

DO $$
DECLARE
  v_exists boolean;
  v_fk record;
BEGIN
  -- notas_recebidas.company_id → companies.id
  FOR v_fk IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.notas_recebidas'::regclass
      AND contype = 'f'
      AND confrelid = 'public.companies'::regclass
  LOOP
    EXECUTE format('ALTER TABLE public.notas_recebidas DROP CONSTRAINT %I', v_fk.conname);
  END LOOP;

  ALTER TABLE public.notas_recebidas
    ADD CONSTRAINT notas_recebidas_company_id_fkey
      FOREIGN KEY (company_id)
      REFERENCES public.companies(id)
      ON DELETE RESTRICT;

  -- nfe_documents.company_id → companies.id (se a tabela existir)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'nfe_documents'
  ) INTO v_exists;

  IF v_exists THEN
    FOR v_fk IN
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'public.nfe_documents'::regclass
        AND contype = 'f'
        AND confrelid = 'public.companies'::regclass
    LOOP
      EXECUTE format('ALTER TABLE public.nfe_documents DROP CONSTRAINT %I', v_fk.conname);
    END LOOP;

    ALTER TABLE public.nfe_documents
      ADD CONSTRAINT nfe_documents_company_id_fkey
        FOREIGN KEY (company_id)
        REFERENCES public.companies(id)
        ON DELETE RESTRICT;
  END IF;

  -- fiscal_documents.company_id → companies.id (se existir)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'fiscal_documents'
  ) INTO v_exists;

  IF v_exists THEN
    FOR v_fk IN
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'public.fiscal_documents'::regclass
        AND contype = 'f'
        AND confrelid = 'public.companies'::regclass
    LOOP
      EXECUTE format('ALTER TABLE public.fiscal_documents DROP CONSTRAINT %I', v_fk.conname);
    END LOOP;

    ALTER TABLE public.fiscal_documents
      ADD CONSTRAINT fiscal_documents_company_id_fkey
        FOREIGN KEY (company_id)
        REFERENCES public.companies(id)
        ON DELETE RESTRICT;
  END IF;
END $$;

COMMENT ON CONSTRAINT notas_recebidas_company_id_fkey
  ON public.notas_recebidas
  IS 'RESTRICT obrigatório: XMLs recebidos têm retenção legal de 5 anos (Lei nº 8.846/94, Decreto 70.235/72). Use admin_delete_company para fluxo controlado.';
