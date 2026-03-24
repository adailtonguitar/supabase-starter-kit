-- Adicionar colunas de controle de entrada à tabela nfe_imports
ALTER TABLE nfe_imports
  ADD COLUMN IF NOT EXISTS nfe_series text,
  ADD COLUMN IF NOT EXISTS nfe_model text DEFAULT '55-NFe',
  ADD COLUMN IF NOT EXISTS entry_number serial,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pendente' CHECK (status IN ('pendente', 'finalizado'));

-- Índice para consulta rápida de entradas por empresa
CREATE INDEX IF NOT EXISTS idx_nfe_imports_company_status ON nfe_imports(company_id, status);

-- Policy de update para poder finalizar entradas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'nfe_imports' AND policyname = 'Users can update own company nfe_imports'
  ) THEN
    CREATE POLICY "Users can update own company nfe_imports"
      ON nfe_imports FOR UPDATE
      USING (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()));
  END IF;
END$$;

-- Policy de delete
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'nfe_imports' AND policyname = 'Users can delete own company nfe_imports'
  ) THEN
    CREATE POLICY "Users can delete own company nfe_imports"
      ON nfe_imports FOR DELETE
      USING (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()));
  END IF;
END$$;
