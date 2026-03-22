-- Tabela para persistir NF-e recebidas da SEFAZ (via DF-e / Nuvem Fiscal)
CREATE TABLE IF NOT EXISTS notas_recebidas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  chave_nfe text NOT NULL,
  nsu bigint,
  cnpj_emitente text,
  nome_emitente text,
  data_emissao timestamptz,
  valor_total numeric(12,2),
  numero_nfe integer,
  serie integer,
  schema_tipo text DEFAULT 'NF-e',
  situacao text DEFAULT 'resumo',          -- resumo | manifesto | completo
  status_manifestacao text DEFAULT 'pendente', -- pendente | ciencia | confirmado | desconhecido | nao_realizada
  xml_completo text,
  nuvem_fiscal_id text,                    -- ID do documento na Nuvem Fiscal
  importado boolean DEFAULT false,         -- se já foi importado para estoque
  importado_em timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, chave_nfe)
);

-- Tabela para controlar último NSU consultado por empresa
CREATE TABLE IF NOT EXISTS dfe_sync_control (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE UNIQUE,
  ultimo_nsu bigint DEFAULT 0,
  ultima_consulta timestamptz,
  updated_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE notas_recebidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE dfe_sync_control ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company notas_recebidas"
  ON notas_recebidas FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM company_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own company notas_recebidas"
  ON notas_recebidas FOR INSERT
  WITH CHECK (company_id IN (
    SELECT company_id FROM company_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update own company notas_recebidas"
  ON notas_recebidas FOR UPDATE
  USING (company_id IN (
    SELECT company_id FROM company_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Service role full access notas_recebidas"
  ON notas_recebidas FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can view own dfe_sync_control"
  ON dfe_sync_control FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM company_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Service role full access dfe_sync_control"
  ON dfe_sync_control FOR ALL
  USING (true)
  WITH CHECK (true);

-- Índices
CREATE INDEX IF NOT EXISTS idx_notas_recebidas_company ON notas_recebidas(company_id);
CREATE INDEX IF NOT EXISTS idx_notas_recebidas_chave ON notas_recebidas(chave_nfe);
CREATE INDEX IF NOT EXISTS idx_notas_recebidas_situacao ON notas_recebidas(company_id, situacao);
