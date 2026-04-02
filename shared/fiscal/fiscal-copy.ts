type FiscalCopyOptions = {
  ascii?: boolean;
};

function normalizeCopy(value: string, options?: FiscalCopyOptions): string {
  if (!options?.ascii) return value;

  return value
    .replace(/á/g, "a")
    .replace(/Á/g, "A")
    .replace(/ã/g, "a")
    .replace(/Ã/g, "A")
    .replace(/â/g, "a")
    .replace(/Â/g, "A")
    .replace(/à/g, "a")
    .replace(/À/g, "A")
    .replace(/é/g, "e")
    .replace(/É/g, "E")
    .replace(/ê/g, "e")
    .replace(/Ê/g, "E")
    .replace(/í/g, "i")
    .replace(/Í/g, "I")
    .replace(/ó/g, "o")
    .replace(/Ó/g, "O")
    .replace(/ô/g, "o")
    .replace(/Ô/g, "O")
    .replace(/õ/g, "o")
    .replace(/Õ/g, "O")
    .replace(/ú/g, "u")
    .replace(/Ú/g, "U")
    .replace(/ç/g, "c")
    .replace(/Ç/g, "C");
}

export function fiscalConflictBadgeLabel(options?: FiscalCopyOptions): string {
  return normalizeCopy("Conflito crítico", options);
}

export function fiscalPendingBadgeLabel(gaps: string[], options?: FiscalCopyOptions): string {
  return normalizeCopy(`Pendência fiscal: ${gaps.join(", ")}`, options);
}

export function stCategoryConflictMessage(description?: string, options?: FiscalCopyOptions): string {
  return normalizeCopy(
    `O NCM sugere Substituição Tributária (${description || "cenário ST"}), mas a categoria fiscal atual não está marcada como ST.`,
    options,
  );
}

export function cfopConflictMessage(currentCfop: string, suggestedCfop: string, options?: FiscalCopyOptions): string {
  return normalizeCopy(
    `A categoria fiscal selecionada usa CFOP ${currentCfop}, diferente da sugestão central ${suggestedCfop}.`,
    options,
  );
}

export function csosnConflictMessage(currentCode: string, suggestedCode: string, options?: FiscalCopyOptions): string {
  return normalizeCopy(
    `A categoria fiscal usa CSOSN ${currentCode}, diferente da sugestão central ${suggestedCode}.`,
    options,
  );
}

export function cstIcmsConflictMessage(currentCode: string, suggestedCode: string, options?: FiscalCopyOptions): string {
  return normalizeCopy(
    `A categoria fiscal usa CST ICMS ${currentCode}, diferente da sugestão central ${suggestedCode}.`,
    options,
  );
}

export function buildFiscalIssueSample(names: string[], options?: FiscalCopyOptions): string {
  return normalizeCopy(names.slice(0, 3).join(", "), options);
}

export function productsFiscalInvalidMessage(count: number, sample: string, options?: FiscalCopyOptions): string {
  return normalizeCopy(
    `${count} produto(s) ativo(s) estão sem NCM/CFOP/CST/Origem válidos para NFC-e. Exemplos: ${sample}. ` +
      `O item no carrinho pode estar correto: com NFC-e automática o sistema bloqueia enquanto existir qualquer produto ativo com cadastro fiscal incompleto.`,
    options,
  );
}

export function productsFiscalConflictMessage(count: number, sample: string, options?: FiscalCopyOptions): string {
  return normalizeCopy(
    `${count} produto(s) ativo(s) estão com conflito fiscal crítico entre NCM, categoria e sugestão central. Exemplos: ${sample}.`,
    options,
  );
}

export function unnamedProductLabel(options?: FiscalCopyOptions): string {
  return normalizeCopy("Produto sem nome", options);
}
