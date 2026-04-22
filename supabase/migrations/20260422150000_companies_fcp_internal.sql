-- Permite sobrescrever, por empresa, o percentual de FCP interno que o motor
-- fiscal aplica nos blocos ICMS00/20/10 (operacao interna). Quando NULL, o
-- emit-nfce cai no mapa default por UF (RJ 2%, MG 2%, BA 2%, PE 2%, CE 2%,
-- etc., conforme art. 82 ADCT e convenios ICMS). PI permanece em 0 para
-- evitar a rejeicao 793.
--
-- Base legal: art. 82 ADCT; Lei Kandir (LC 87/96); convenios ICMS 42/2016
-- e legislacoes estaduais especificas (ex.: Lei MG 19.978/11, Lei RJ 4.056/02).
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS fcp_internal_percent numeric(5,2);

COMMENT ON COLUMN public.companies.fcp_internal_percent IS
  'Override do percentual de FCP interno (0-100). Quando NULL, o emit-nfce aplica o default da UF do emitente.';
