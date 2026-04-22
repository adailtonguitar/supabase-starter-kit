-- ============================================================================
-- Regime de PIS/COFINS por empresa (cumulativo vs não-cumulativo)
-- ============================================================================
-- Contexto:
-- Empresas do Regime Normal (CRT=3) podem estar em:
--   • Lucro Real → PIS 1,65% + COFINS 7,60% (não-cumulativo)
--   • Lucro Presumido → PIS 0,65% + COFINS 3,00% (cumulativo)
-- O motor fiscal usava sempre 1,65/7,60, o que infla PIS/COFINS em empresas
-- de Lucro Presumido e causa rejeição SEFAZ ou divergência na EFD-Contribuições.
--
-- Esta migração é aditiva:
--   • adiciona coluna `pis_cofins_regime` em public.companies
--   • default = 'nao_cumulativo' (mantém comportamento atual para não quebrar)
--   • empresas de Lucro Presumido marcam explicitamente 'cumulativo' na UI
-- Totalmente reversível via DROP COLUMN.
-- ============================================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS pis_cofins_regime text
    DEFAULT 'nao_cumulativo'
    CHECK (pis_cofins_regime IN ('nao_cumulativo', 'cumulativo'));

COMMENT ON COLUMN public.companies.pis_cofins_regime IS
  'Regime de apuração de PIS/COFINS: nao_cumulativo (Lucro Real, 1.65%/7.60%) ou cumulativo (Lucro Presumido, 0.65%/3.00%). Ignorado para empresas do Simples Nacional (CST 49).';
