/**
 * fiscal-audit-store — Persistência local (read-only para o painel) dos eventos
 * gerados pelo shadow pipeline. NÃO altera emissão, NÃO altera XML.
 *
 * Armazena em localStorage["cfop_analysis"] como ring buffer (máx. 500).
 * Falhas são silenciosamente ignoradas (fail-safe).
 */
const KEY = "cfop_analysis";
const MAX = 500;

export interface FiscalAuditEvent {
  produto_id: string | null;
  cfop_atual: string | null;
  cfop_sugerido: string | null;
  applied: boolean;
  applied_fields: string[];
  skipped_fields: string[];
  divergences: Array<{ field: string; current: any; suggested: any }>;
  reason: string;
  timestamp: string;
}

export interface FiscalAuditStats {
  total: number;
  auto_apply_rate: number;
  divergence_rate: number;
  fallback_rate: number;
  top_skipped_fields: Array<{ field: string; count: number }>;
  top_cfop_errors: Array<{ key: string; current: string; suggested: string; count: number }>;
  status: "READY" | "STABLE" | "RISK" | "NO_DATA";
  status_label: string;
}

export function recordFiscalAuditEvent(ev: Omit<FiscalAuditEvent, "timestamp">): void {
  try {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(KEY);
    const arr: FiscalAuditEvent[] = raw ? JSON.parse(raw) : [];
    arr.push({ ...ev, timestamp: new Date().toISOString() });
    const trimmed = arr.length > MAX ? arr.slice(arr.length - MAX) : arr;
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch { /* fail-safe */ }
}

export function readFiscalAuditEvents(): FiscalAuditEvent[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function clearFiscalAuditEvents(): void {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
}

export function getFiscalAuditStats(): FiscalAuditStats {
  const events = readFiscalAuditEvents();
  const total = events.length;

  if (total === 0) {
    return {
      total: 0,
      auto_apply_rate: 0,
      divergence_rate: 0,
      fallback_rate: 0,
      top_skipped_fields: [],
      top_cfop_errors: [],
      status: "NO_DATA",
      status_label: "SEM DADOS",
    };
  }

  const applied = events.filter(e => e.applied).length;
  const withDiv = events.filter(e => (e.divergences?.length ?? 0) > 0).length;
  const fallback = events.filter(e => e.reason === "rpc_failed_fail_safe").length;

  const skippedMap = new Map<string, number>();
  for (const e of events) {
    for (const f of e.skipped_fields || []) {
      skippedMap.set(f, (skippedMap.get(f) || 0) + 1);
    }
  }
  const top_skipped_fields = Array.from(skippedMap.entries())
    .map(([field, count]) => ({ field, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const cfopMap = new Map<string, { current: string; suggested: string; count: number }>();
  for (const e of events) {
    for (const d of e.divergences || []) {
      if (d.field !== "cfop") continue;
      const cur = String(d.current ?? "");
      const sug = String(d.suggested ?? "");
      const k = `${cur}→${sug}`;
      const prev = cfopMap.get(k);
      if (prev) prev.count += 1;
      else cfopMap.set(k, { current: cur, suggested: sug, count: 1 });
    }
  }
  const top_cfop_errors = Array.from(cfopMap.entries())
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const auto_apply_rate = applied / total;
  const divergence_rate = withDiv / total;
  const fallback_rate = fallback / total;

  let status: FiscalAuditStats["status"] = "RISK";
  let status_label = "RISCO — NÃO ESCALAR";
  if (auto_apply_rate >= 0.95 && total >= 30) {
    status = "READY";
    status_label = "PRONTO PARA ESCALA";
  } else if (auto_apply_rate >= 0.85) {
    status = "STABLE";
    status_label = "ESTÁVEL, MAS MONITORAR";
  }

  return {
    total,
    auto_apply_rate,
    divergence_rate,
    fallback_rate,
    top_skipped_fields,
    top_cfop_errors,
    status,
    status_label,
  };
}
