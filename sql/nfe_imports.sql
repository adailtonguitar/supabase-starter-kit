-- Tabela para controle de NF-e já importadas (evitar duplicidade)
CREATE TABLE IF NOT EXISTS nfe_imports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  access_key text NOT NULL,            -- chave de acesso (44 dígitos)
  nfe_number text,                     -- número da NF-e
  supplier_name text,
  supplier_cnpj text,
  total_value numeric(12,2),
  products_count integer,
  imported_at timestamptz DEFAULT now(),
  imported_by uuid REFERENCES auth.users(id),
  UNIQUE(company_id, access_key)
);

-- RLS
ALTER TABLE nfe_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company nfe_imports"
  ON nfe_imports FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM company_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own company nfe_imports"
  ON nfe_imports FOR INSERT
  WITH CHECK (company_id IN (
    SELECT company_id FROM company_users WHERE user_id = auth.uid()
  ));
