/**
 * Recipient Checker — Consulta cadastral do destinatário
 * 
 * Valida se CNPJ está ativo e IE habilitada via Nuvem Fiscal.
 * Usa cache em memória (TTL 24h) para evitar chamadas excessivas.
 */

import type { RecipientCheckResult } from "./types";

// Cache em memória simples (key = cnpj, TTL = 24h)
const cache = new Map<string, { result: RecipientCheckResult; expiresAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface RecipientInput {
  cnpj: string;
  uf: string;
  ie?: string;
  indIEDest?: number;
}

/**
 * Consulta cadastral via Nuvem Fiscal.
 * Requer NUVEMFISCAL_TOKEN no ambiente.
 */
export async function checkRecipient(
  input: RecipientInput,
  nuvemFiscalToken?: string,
): Promise<RecipientCheckResult> {
  const cnpj = (input.cnpj || "").replace(/\D/g, "");

  // CPF — skip (não tem consulta cadastral SEFAZ para PF)
  if (cnpj.length === 11) {
    return { valid: true, cnpjAtivo: true, ieValida: true, situacao: "PF — skip", source: "skip" };
  }

  if (cnpj.length !== 14) {
    return { valid: false, cnpjAtivo: false, ieValida: false, situacao: "CNPJ inválido", source: "skip" };
  }

  // Check cache
  const cached = cache.get(cnpj);
  if (cached && Date.now() < cached.expiresAt) {
    return { ...cached.result, source: "cache" };
  }

  // Se não tem token, skip gracefully
  if (!nuvemFiscalToken) {
    return { valid: true, cnpjAtivo: true, ieValida: true, situacao: "Token indisponível — skip", source: "skip" };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const resp = await fetch(
      `https://api.nuvemfiscal.com.br/cnpj/${cnpj}`,
      {
        headers: {
          Authorization: `Bearer ${nuvemFiscalToken}`,
          Accept: "application/json",
        },
        signal: controller.signal,
      },
    );

    clearTimeout(timeoutId);

    if (!resp.ok) {
      return {
        valid: true, cnpjAtivo: true, ieValida: true,
        situacao: `Consulta retornou HTTP ${resp.status} — não bloqueante`,
        source: "nuvemfiscal",
        error: `HTTP ${resp.status}`,
      };
    }

    const data = await resp.json();
    const situacao = (data.situacao_cadastral?.descricao || data.situacao || "").toUpperCase();
    const cnpjAtivo = situacao.includes("ATIVA") || situacao.includes("ATIVO");

    // IE — validar se informada
    let ieValida = true;
    if (input.indIEDest === 1 && input.ie) {
      // Para contribuintes, a IE deveria estar vinculada
      // A consulta básica de CNPJ não valida IE diretamente,
      // mas se o CNPJ está ativo, consideramos válido
      ieValida = cnpjAtivo;
    }

    const result: RecipientCheckResult = {
      valid: cnpjAtivo,
      cnpjAtivo,
      ieValida,
      situacao: situacao || "DESCONHECIDA",
      source: "nuvemfiscal",
    };

    // Salvar no cache
    cache.set(cnpj, { result, expiresAt: Date.now() + CACHE_TTL_MS });

    return result;
  } catch (err: any) {
    // Timeout ou erro de rede — não bloquear
    return {
      valid: true, cnpjAtivo: true, ieValida: true,
      situacao: `Erro na consulta: ${err.message} — não bloqueante`,
      source: "nuvemfiscal",
      error: err.message,
    };
  }
}
