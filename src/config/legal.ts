/**
 * Dados legais centralizados do SaaS.
 *
 * Sempre que mudar os textos de Termos/Privacidade, INCREMENTE a versão correspondente.
 * Versões diferentes forçam o usuário a aceitar novamente.
 */

export const LEGAL_CONFIG = {
  companyName: "AnthoSystem",
  companyLegalName: "65.685.215 ADAILTON PAULO DA ROCHA",
  companyCNPJ: "65.685.215/0001-39",
  companyAddress: "Rua Getúlio Vargas, S/N, São José, Tasso Fragoso - MA, CEP 65820-000",
  supportEmail: "contato@anthosystem.com.br",
  supportWhatsapp: "(99) 98234-5366",
  /** Número limpo só com dígitos, incluindo DDI Brasil. Usado em links wa.me/ */
  supportWhatsappRaw: "5599982345366",

  termsVersion: "1.1",
  termsLastUpdate: "20 de abril de 2026",

  privacyVersion: "1.1",
  privacyLastUpdate: "20 de abril de 2026",

  dpoEmail: "contato@anthosystem.com.br",

  /** SLA de atendimento publicado — alterar aqui reflete em /suporte e rodapé. */
  supportHours: "Segunda a sexta-feira, das 8h às 18h (exceto feriados)",
  /** Tempo máximo prometido de primeira resposta em cada canal. */
  supportSla: {
    whatsapp: "até 2 horas úteis",
    email: "até 24 horas úteis",
    urgent: "até 1 hora útil (falhas de emissão fiscal ou sistema fora do ar)",
  },
} as const;

export const TERMS_VERSION = LEGAL_CONFIG.termsVersion;
export const PRIVACY_VERSION = LEGAL_CONFIG.privacyVersion;
