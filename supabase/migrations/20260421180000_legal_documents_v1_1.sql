-- ============================================================================
-- Seed: legal_documents v1.1 (alinhado com src/config/legal.ts)
-- ----------------------------------------------------------------------------
-- Motivação:
--   O código (LEGAL_CONFIG.termsVersion / privacyVersion) está em 1.1, mas o
--   banco só tinha seed de v1.0 da migration 20260421130000. Isso deixava o
--   PendingConsentsDialog inconsistente (alguns usuários aceitaram v1.0, e
--   como v1.0 ainda está ativa, o sistema nunca pedia re-aceite).
--
-- Esta migration:
--   1. Publica v1.1 de 'terms' e 'privacy' como ativas.
--   2. O trigger tg_legal_documents_single_active marca v1.0 anteriores como
--      inativas automaticamente.
--   3. content_url aponta para as páginas públicas /termos e /privacidade
--      (assim o front-end consegue abrir o texto completo num botão).
--   4. summary contém o resumo dos principais pontos para o dialog de
--      consentimento mostrar antes do usuário clicar "li e aceito".
-- ============================================================================

INSERT INTO public.legal_documents (kind, version, title, summary, content_url, is_active, published_at)
VALUES
  (
    'terms',
    '1.1',
    'Termos de Uso',
    E'Ao usar o AnthoSystem você concorda que:\n'
    '• Os dados inseridos são de sua responsabilidade e veracidade.\n'
    '• O serviço é fornecido "como está", com SLA de melhor esforço.\n'
    '• Cancelamento pode ser feito a qualquer momento (retenção de dados: 30 dias após cancelamento).\n'
    '• A empresa se reserva o direito de suspender contas em caso de uso indevido.\n'
    '• Termo completo em /termos — versão 1.1 — atualizado em 20/04/2026.',
    '/termos',
    TRUE,
    NOW()
  ),
  (
    'privacy',
    '1.1',
    'Política de Privacidade',
    E'Tratamento de dados pessoais (LGPD):\n'
    '• Coletamos: nome, e-mail, telefone, dados da empresa (CNPJ, IE, endereço).\n'
    '• Finalidade: operar o sistema fiscal/gestão que você contratou.\n'
    '• Base legal: execução de contrato + legítimo interesse.\n'
    '• Compartilhamento: SEFAZ (emissão fiscal), provedores de pagamento (Mercado Pago).\n'
    '• Seus direitos: acesso, correção, exclusão, portabilidade. DPO: contato@anthosystem.com.br.\n'
    '• Política completa em /privacidade — versão 1.1 — atualizada em 20/04/2026.',
    '/privacidade',
    TRUE,
    NOW()
  ),
  (
    'contract_saas',
    '1.1',
    'Contrato SaaS',
    E'Contrato de prestação de serviços SaaS:\n'
    '• Licença de uso de software mediante assinatura mensal.\n'
    '• Planos e preços descritos em /planos.\n'
    '• Pagamento antecipado via Pix/cartão. Inadimplência >14 dias: suspensão.\n'
    '• Cláusulas completas em /contrato — versão 1.1 — atualizado em 20/04/2026.',
    '/contrato',
    TRUE,
    NOW()
  )
ON CONFLICT (kind, version) DO UPDATE
  SET summary      = EXCLUDED.summary,
      content_url  = EXCLUDED.content_url,
      is_active    = EXCLUDED.is_active,
      published_at = EXCLUDED.published_at;

-- Garante que só v1.1 está ativa (trigger já faz isso ao inserir ativa,
-- mas rodamos explicitamente para cobrir o caso de ON CONFLICT DO UPDATE).
UPDATE public.legal_documents
   SET is_active = FALSE
 WHERE kind IN ('terms', 'privacy', 'contract_saas')
   AND version <> '1.1'
   AND is_active = TRUE;

-- ============================================================================
-- Verificação (rodar manualmente se quiser):
--   SELECT kind, version, is_active, title FROM public.legal_documents
--    WHERE kind IN ('terms','privacy','contract_saas')
--    ORDER BY kind, version;
-- ============================================================================
