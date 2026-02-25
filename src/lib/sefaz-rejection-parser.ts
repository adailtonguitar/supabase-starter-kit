/**
 * SEFAZ Rejection Code Parser — Maps rejection codes to actionable operator guidance.
 * Based on NT 2019.001, NT 2020.005, NT 2021.004 and common SEFAZ rejections.
 */

export interface SefazRejection {
  code: string;
  title: string;
  guidance: string;
  field?: string; // which tab/field to highlight
}

const REJECTION_MAP: Record<string, Omit<SefazRejection, "code">> = {
  // ── Emitente ──
  "203": { title: "Emitente não habilitado", guidance: "Verifique se a IE da empresa está ativa na SEFAZ do estado. Acesse o Cadastro Centralizado de Contribuintes (CCC).", field: "emitente" },
  "207": { title: "CNPJ do emitente inválido", guidance: "O CNPJ cadastrado na empresa está incorreto. Vá em Empresas e corrija o CNPJ.", field: "emitente" },
  "209": { title: "IE do emitente inválida", guidance: "A Inscrição Estadual está inválida ou não corresponde ao CNPJ. Corrija em Empresas > Inscrição Estadual.", field: "emitente" },
  "213": { title: "CNPJ do emitente não cadastrado na SEFAZ", guidance: "O CNPJ não consta no cadastro da SEFAZ. Verifique se a empresa está regularizada.", field: "emitente" },
  "227": { title: "IE do emitente não vinculada ao CNPJ", guidance: "A IE informada não está vinculada ao CNPJ na base da SEFAZ. Verifique no Sintegra.", field: "emitente" },
  "301": { title: "Uso denegado: Emitente em situação irregular", guidance: "A empresa está com situação irregular na SEFAZ. Entre em contato com a contabilidade para regularizar.", field: "emitente" },
  "302": { title: "Uso denegado: Destinatário em situação irregular", guidance: "O CPF/CNPJ do destinatário está irregular na SEFAZ. Remova o destinatário ou use outro documento.", field: "customer" },

  // ── Certificado ──
  "210": { title: "Certificado digital inválido", guidance: "O certificado A1 pode estar expirado ou não corresponde ao CNPJ da empresa. Vá em Fiscal > Configuração e reenvie o certificado.", field: "emitente" },
  "212": { title: "Data de emissão do certificado inválida", guidance: "O certificado digital tem data de validade inconsistente. Verifique a data do certificado A1.", field: "emitente" },
  "280": { title: "Certificado digital revogado", guidance: "O certificado foi revogado pela Autoridade Certificadora. É necessário adquirir um novo certificado A1.", field: "emitente" },
  "281": { title: "Certificado digital expirado", guidance: "O certificado A1 está vencido. Renove-o com a Autoridade Certificadora e reenvie em Fiscal > Configuração.", field: "emitente" },

  // ── NCM ──
  "778": { title: "NCM inválido", guidance: "O NCM informado não existe na tabela oficial. Consulte a TIPI e corrija o NCM do produto.", field: "items" },
  "379": { title: "NCM não encontrado na tabela", guidance: "O NCM do produto não consta na tabela NCM/SH vigente. Verifique se o código foi digitado corretamente.", field: "items" },

  // ── CFOP ──
  "327": { title: "CFOP inválido para NFC-e", guidance: "NFC-e só aceita CFOPs da série 5xxx (operações internas). Corrija para 5102 (venda) ou 5405 (ST).", field: "items" },
  "328": { title: "CFOP incompatível com tipo de documento", guidance: "O CFOP informado não é compatível com NFC-e. Use 5102 para venda normal.", field: "items" },
  "370": { title: "CFOP de entrada usado em NFC-e", guidance: "NFC-e é exclusiva para saída. Use CFOPs de saída (5xxx).", field: "items" },

  // ── ICMS / CST ──
  "388": { title: "CST incompatível com CFOP", guidance: "O CST/CSOSN informado não combina com o CFOP. Exemplo: CFOP 5405 exige CST 60 ou CSOSN 500.", field: "items" },
  "389": { title: "CST incompatível com regime tributário", guidance: "Simples Nacional deve usar CSOSN (101-900). Regime Normal deve usar CST ICMS (00-90). Corrija na aba Itens.", field: "items" },
  "696": { title: "FCP: Base de cálculo obrigatória", guidance: "O estado exige o preenchimento da base de cálculo do FCP. Verifique se a alíquota FCP está configurada.", field: "items" },
  "697": { title: "FCP: Valor obrigatório", guidance: "O estado exige o valor do FCP (Fundo de Combate à Pobreza). O sistema calcula automaticamente — verifique se o estado está correto.", field: "items" },

  // ── Destinatário / Consumidor ──
  "235": { title: "CPF/CNPJ do destinatário inválido", guidance: "O CPF ou CNPJ do cliente está incorreto. Corrija na aba Cliente ou deixe em branco para consumidor não identificado.", field: "customer" },
  "238": { title: "CPF do destinatário inválido", guidance: "O CPF informado é inválido (dígitos verificadores incorretos). Corrija na aba Cliente.", field: "customer" },

  // ── Duplicidade ──
  "204": { title: "NFC-e duplicada", guidance: "Já existe uma NFC-e autorizada com esta mesma chave de acesso. Verifique se a nota já foi emitida anteriormente.", field: "emitente" },
  "539": { title: "Duplicidade: mesma chave de acesso", guidance: "Esta NFC-e já foi enviada e autorizada. Consulte o status na lista de documentos fiscais.", field: "emitente" },

  // ── Ambiente ──
  "252": { title: "Ambiente incorreto", guidance: "Você está tentando emitir em produção mas a configuração está em homologação (ou vice-versa). Ajuste em Fiscal > Configuração.", field: "emitente" },

  // ── Pagamento ──
  "865": { title: "Valor do pagamento divergente", guidance: "A soma dos pagamentos não confere com o total da nota. Ajuste o valor pago na aba Pagamento.", field: "payment" },

  // ── Valor / Cálculo ──
  "528": { title: "Valor total diferente da soma dos itens", guidance: "O total dos itens não bate com o valor total da nota. Verifique quantidades, preços e descontos.", field: "items" },
  "529": { title: "Valor do ICMS incorreto", guidance: "O cálculo do ICMS está divergente. Verifique a alíquota e base de cálculo de cada item.", field: "items" },

  // ── Série / Número ──
  "218": { title: "NFC-e já está inutilizada", guidance: "Este número já foi inutilizado na SEFAZ. O sistema usará o próximo número disponível automaticamente.", field: "emitente" },
  "206": { title: "NFC-e já está cancelada", guidance: "Esta NFC-e já foi cancelada anteriormente.", field: "emitente" },

  // ── Contingência ──
  "460": { title: "Contingência: prazo de transmissão expirado", guidance: "A NFC-e em contingência deve ser transmitida em até 24h. O prazo foi excedido e será necessário inutilizar esta numeração.", field: "emitente" },
  "467": { title: "Contingência: tipo de emissão inválido", guidance: "O tipo de emissão em contingência (tpEmis) não é aceito para NFC-e neste estado.", field: "emitente" },

  // ── Assinatura ──
  "225": { title: "Assinatura digital inválida", guidance: "A assinatura XML está incorreta. Isso pode ocorrer se o certificado não corresponde ao CNPJ. Reenvie o certificado A1.", field: "emitente" },
  "298": { title: "Assinatura com certificado revogado", guidance: "O certificado usado na assinatura foi revogado. Adquira um novo certificado A1.", field: "emitente" },
};

/**
 * Parse a SEFAZ error response and extract actionable rejection info.
 * Tries to find rejection code in the error message or details object.
 */
export function parseSefazRejection(errorMsg: string, details?: any): SefazRejection | null {
  // Try to extract code from message like "Rejeição 302: ..." or "[cStat=302]" or "302 -"
  const codePatterns = [
    /[Rr]ejei[çc][aã]o\s*(\d{3})/,
    /cStat[=:\s]*(\d{3})/,
    /\[(\d{3})\]/,
    /^(\d{3})\s*[-–:]/,
    /codigo[_\s]*status[=:\s]*(\d{3})/i,
    /status[_\s]*code[=:\s]*(\d{3})/i,
  ];

  let code: string | null = null;

  // Search in error message
  for (const pattern of codePatterns) {
    const match = errorMsg.match(pattern);
    if (match) { code = match[1]; break; }
  }

  // Search in details object if no code found
  if (!code && details) {
    const detailStr = typeof details === "string" ? details : JSON.stringify(details);
    for (const pattern of codePatterns) {
      const match = detailStr.match(pattern);
      if (match) { code = match[1]; break; }
    }
    // Also check for direct cStat field
    if (!code && details.cStat) code = String(details.cStat);
    if (!code && details.codigo_status) code = String(details.codigo_status);
    if (!code && details.status_code) code = String(details.status_code);
  }

  if (!code) return null;

  const mapped = REJECTION_MAP[code];
  if (!mapped) {
    return {
      code,
      title: `Rejeição ${code}`,
      guidance: `Código de rejeição ${code} não mapeado. Consulte a tabela de rejeições da SEFAZ ou entre em contato com o suporte técnico.`,
    };
  }

  return { code, ...mapped };
}

/**
 * Format a rejection for display with code, title and guidance.
 */
export function formatRejectionMessage(rejection: SefazRejection): string {
  return `[${rejection.code}] ${rejection.title}: ${rejection.guidance}`;
}
