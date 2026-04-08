/**
 * Alinha a checagem de "prontidão fiscal do catálogo" ao modelo de estoque CNPJ vs CPF:
 * produtos que só têm movimentação explícita `cpf` (sem nota) não entram na barreira global
 * de NCM/CFOP/CST — o fluxo de estoque já os classifica como fora do lastro CNPJ.
 *
 * Conservador: qualquer movimento `cnpj` ou `mixed` mantém o produto na checagem.
 * Movimentos com `acquisition_type` nulo (legado) não geram exclusão.
 */
export type MovementAcquisitionRow = {
  product_id: string | null;
  acquisition_type: string | null;
};

export function productIdsExcludedFromCatalogFiscalReadiness(
  movements: MovementAcquisitionRow[],
): Set<string> {
  const typesByProduct = new Map<string, Set<string>>();
  for (const m of movements) {
    const pid = m.product_id;
    if (!pid) continue;
    const raw = (m.acquisition_type || "").trim().toLowerCase();
    if (!raw) continue;
    if (!typesByProduct.has(pid)) typesByProduct.set(pid, new Set());
    typesByProduct.get(pid)!.add(raw);
  }

  const excluded = new Set<string>();
  for (const [pid, types] of typesByProduct) {
    if (types.has("cpf") && !types.has("cnpj") && !types.has("mixed")) {
      excluded.add(pid);
    }
  }
  return excluded;
}
