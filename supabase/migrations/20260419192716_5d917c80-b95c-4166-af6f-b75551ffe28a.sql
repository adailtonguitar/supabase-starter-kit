-- Adiciona coluna trial_ends_at
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- Backfill: empresas existentes ganham created_at + 30 dias
UPDATE public.companies
   SET trial_ends_at = created_at + INTERVAL '30 days'
 WHERE trial_ends_at IS NULL;

-- Default para novas empresas: now() + 30 dias
ALTER TABLE public.companies
  ALTER COLUMN trial_ends_at SET DEFAULT (now() + INTERVAL '30 days');

-- Índice para queries de billing/trial expirado
CREATE INDEX IF NOT EXISTS idx_companies_trial_ends_at
  ON public.companies (trial_ends_at)
  WHERE trial_ends_at IS NOT NULL;