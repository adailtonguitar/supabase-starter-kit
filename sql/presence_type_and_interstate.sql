-- =====================================================
-- Presence Type (indPres) + Interstate Support
-- =====================================================

-- Add presence_type column to sales table
-- 1 = Presencial, 2 = Internet, 3 = Telefone, 9 = Outros
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS presence_type SMALLINT DEFAULT 1;

-- Add comment for documentation
COMMENT ON COLUMN public.sales.presence_type IS 'Tipo de presença do comprador (indPres SEFAZ): 1=Presencial, 2=Internet, 3=Telefone, 9=Outros';

-- Index for analytics queries
CREATE INDEX IF NOT EXISTS idx_sales_presence_type ON public.sales(presence_type);
