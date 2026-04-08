/**
 * Duplicity Checker — Verificação de NF-e duplicada
 * 
 * Consulta banco local para evitar emissão duplicada.
 * Usado no pipeline de pré-validação.
 */

import type { DuplicityCheckResult } from "./types";

export interface DuplicityInput {
  companyId: string;
  modelo: 55 | 65;
  serie: number;
  numero: number;
  /** chave de acesso, se já gerada */
  chaveAcesso?: string;
}

/**
 * Verifica duplicidade consultando o Supabase.
 * Deve ser chamada com um client que tenha acesso à tabela notas_fiscais / nfce.
 */
export async function checkDuplicity(
  supabase: any,
  input: DuplicityInput,
): Promise<DuplicityCheckResult> {
  try {
    // 1. Checar por chave de acesso (mais preciso)
    if (input.chaveAcesso) {
      const { data: byChave } = await supabase
        .from("notas_fiscais")
        .select("id, chave_acesso, status")
        .eq("company_id", input.companyId)
        .eq("chave_acesso", input.chaveAcesso)
        .maybeSingle();

      if (byChave) {
        return {
          isDuplicate: true,
          existingId: byChave.id,
          existingChave: byChave.chave_acesso,
          existingStatus: byChave.status,
        };
      }
    }

    // 2. Checar por número + série + modelo
    const { data: byNumero } = await supabase
      .from("notas_fiscais")
      .select("id, chave_acesso, status")
      .eq("company_id", input.companyId)
      .eq("modelo", input.modelo)
      .eq("serie", input.serie)
      .eq("numero", input.numero)
      .in("status", ["autorizada", "pendente", "processando"])
      .maybeSingle();

    if (byNumero) {
      return {
        isDuplicate: true,
        existingId: byNumero.id,
        existingChave: byNumero.chave_acesso,
        existingStatus: byNumero.status,
      };
    }

    return { isDuplicate: false };
  } catch (err: any) {
    // Em caso de erro, NÃO bloquear — apenas logar
    console.error("[DuplicityChecker] Erro na consulta:", err.message);
    return { isDuplicate: false };
  }
}
