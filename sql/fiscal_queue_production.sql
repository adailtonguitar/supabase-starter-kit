-- ============================================================
-- Fiscal Queue - Colunas de produção
-- Executar no Supabase SQL Editor
-- ============================================================

-- 1. Coluna next_retry_at para backoff por item
ALTER TABLE fiscal_queue ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Coluna started_at para medir tempo de processamento
ALTER TABLE fiscal_queue ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT NULL;

-- 3. Coluna finished_at para medir tempo total
ALTER TABLE fiscal_queue ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ DEFAULT NULL;

-- 4. Coluna updated_at para tracking de último update
ALTER TABLE fiscal_queue ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 5. Índice para query de seleção com backoff
CREATE INDEX IF NOT EXISTS idx_fiscal_queue_pending_retry
  ON fiscal_queue (status, next_retry_at, created_at)
  WHERE status = 'pending';

-- 6. Índice para dead_letter monitoring
CREATE INDEX IF NOT EXISTS idx_fiscal_queue_dead_letter
  ON fiscal_queue (company_id, status)
  WHERE status = 'dead_letter';

-- 7. Índice para métricas de processamento
CREATE INDEX IF NOT EXISTS idx_fiscal_queue_finished
  ON fiscal_queue (company_id, finished_at, status)
  WHERE finished_at IS NOT NULL;
