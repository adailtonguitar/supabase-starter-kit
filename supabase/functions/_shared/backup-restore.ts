/**
 * Desembrulha formatos comuns de export (data/records ou duplo aninhamento)
 * e devolve apenas arrays por tabela esperada pelo restore.
 */
export function resolveBackupTableArrays(
  raw: unknown,
  exportableTables: readonly string[],
): Record<string, unknown[]> {
  const keys = [...exportableTables, "sale_items"];
  const empty = (): Record<string, unknown[]> => {
    const o: Record<string, unknown[]> = {};
    for (const k of keys) o[k] = [];
    return o;
  };

  const score = (o: Record<string, unknown>): number =>
    keys.filter((k) => Array.isArray(o[k]) && (o[k] as unknown[]).length > 0).length;

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return empty();
  }

  let node = raw as Record<string, unknown>;

  const unwrap = (candidate: unknown): Record<string, unknown> | null => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    return candidate as Record<string, unknown>;
  };

  let inner = unwrap(node.data);
  if (inner && score(inner) > score(node)) node = inner;

  inner = unwrap(node.records);
  if (inner && score(inner) > score(node)) node = inner;

  inner = unwrap(node.data);
  if (inner) {
    const deep = unwrap(inner.data);
    if (deep && score(deep) > score(node)) node = deep;
  }

  const out = empty();
  for (const k of keys) {
    const v = node[k];
    out[k] = Array.isArray(v) ? [...v] : [];
  }
  return out;
}

export function totalBackupRows(
  tables: Record<string, unknown[]>,
  exportableTables: readonly string[],
): number {
  let n = 0;
  for (const t of exportableTables) n += tables[t]?.length ?? 0;
  n += tables.sale_items?.length ?? 0;
  return n;
}
