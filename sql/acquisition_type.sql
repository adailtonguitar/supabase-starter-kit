-- Add acquisition_type to stock_movements for fiscal origin tracking
-- Run this migration FIRST before deploying code changes

ALTER TABLE public.stock_movements
ADD COLUMN IF NOT EXISTS acquisition_type text
CHECK (acquisition_type IN ('cnpj', 'cpf', 'mixed'))
DEFAULT NULL;

COMMENT ON COLUMN public.stock_movements.acquisition_type IS
  'Fiscal origin of the stock entry: cnpj = with invoice, cpf = without invoice, mixed = both';

-- Index for FIFO fiscal queries (consume cnpj stock first)
CREATE INDEX IF NOT EXISTS idx_stock_movements_acquisition
ON public.stock_movements (product_id, acquisition_type, created_at)
WHERE type = 'entrada';
