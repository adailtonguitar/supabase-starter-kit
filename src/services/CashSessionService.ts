import { supabase } from "@/integrations/supabase/client";
import { logAction } from "@/services/ActionLogger";
import type { CashSessionRecord } from "@/integrations/supabase/fiscal.types";

const LOCAL_SESSION_KEY = "as_offline_cash_session";
const LOCAL_MOVEMENTS_KEY = "as_offline_cash_movements";

function isNetworkError(err: unknown): boolean {
  if (err == null) return false;
  const toStr = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
  const candidates = [
    typeof err === "string" ? err : "",
    toStr((err as { message?: unknown } | undefined)?.message),
    toStr((err as { msg?: unknown } | undefined)?.msg),
    toStr((err as { error_description?: unknown } | undefined)?.error_description),
    toStr((err as { name?: unknown } | undefined)?.name),
    toStr(err),
  ].filter(Boolean);
  const patterns = ["Failed to fetch", "NetworkError", "TypeError", "network", "ECONNREFUSED", "ERR_INTERNET_DISCONNECTED", "Load failed"];
  return candidates.some((c: string) => patterns.some((p) => c.includes(p)));
}

function getOfflineSession(): CashSessionRecord | null {
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CashSessionRecord;
  } catch {
    return null;
  }
}

function saveOfflineSession(session: CashSessionRecord | null) {
  try {
    if (session) localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(LOCAL_SESSION_KEY);
  } catch {
    // offline cache only
  }
}

type OfflineQueuedMovement = {
  action: "open" | "close" | "movement";
  params: unknown;
  created_at: string;
};

function queueOfflineMovement(movement: OfflineQueuedMovement) {
  try {
    const raw = localStorage.getItem(LOCAL_MOVEMENTS_KEY);
    const movements = raw ? (JSON.parse(raw) as OfflineQueuedMovement[]) : [];
    movements.push(movement);
    localStorage.setItem(LOCAL_MOVEMENTS_KEY, JSON.stringify(movements));
  } catch {
    // offline queue only
  }
}

export class CashSessionService {
  static async open(params: { companyId: string; userId: string; openingBalance: number; terminalId?: string }) {
    const terminalId = params.terminalId || "01";
    const openOffline = () => {
      const offlineSession: CashSessionRecord = {
        id: `offline_${Date.now()}`, company_id: params.companyId, opened_by: params.userId,
        opening_balance: params.openingBalance, terminal_id: terminalId, status: "aberto" as const,
        opened_at: new Date().toISOString(), closed_at: null, closed_by: null, closing_balance: null,
        counted_dinheiro: null, counted_debito: null, counted_credito: null, counted_pix: null,
        difference: null, notes: null, sales_count: 0, total_vendas: 0, total_dinheiro: 0,
        total_debito: 0, total_credito: 0, total_pix: 0, total_voucher: 0, total_outros: 0,
        total_sangria: 0, total_suprimento: 0, created_at: new Date().toISOString(),
      };
      saveOfflineSession(offlineSession);
      queueOfflineMovement({ action: "open", params, created_at: new Date().toISOString() });
      return offlineSession;
    };
    if (typeof navigator !== "undefined" && !navigator.onLine) return openOffline();
    try {
      const { data: existing, error: checkErr } = await supabase.from("cash_sessions").select("id").eq("company_id", params.companyId).eq("terminal_id", terminalId).eq("status", "aberto").maybeSingle();
      if (checkErr && isNetworkError(checkErr)) return openOffline();
      if (existing) throw new Error(`Terminal ${terminalId} já possui um caixa aberto`);
      const { data, error } = await supabase.from("cash_sessions").insert({ company_id: params.companyId, opened_by: params.userId, opening_balance: params.openingBalance, terminal_id: terminalId, status: "aberto" }).select().single();
      if (error) { if (isNetworkError(error)) return openOffline(); throw new Error(`Erro ao abrir caixa: ${error.message}`); }
      try { await supabase.from("cash_movements").insert({ company_id: params.companyId, session_id: data.id, type: "abertura", amount: params.openingBalance, performed_by: params.userId, description: "Abertura de caixa" }); } catch {}
      saveOfflineSession(data);
      logAction({ companyId: params.companyId, userId: params.userId, action: "Caixa aberto", module: "caixa", details: `Terminal ${terminalId} - R$ ${params.openingBalance}` });
      return data;
    } catch {
      return openOffline();
    }
  }

  static async close(params: { sessionId: string; companyId: string; userId: string; countedDinheiro: number; countedDebito: number; countedCredito: number; countedPix: number; notes?: string }) {
    const closeOffline = () => {
      const offlineSession = getOfflineSession();
      if (offlineSession && (offlineSession.id === params.sessionId || offlineSession.id.startsWith("offline_"))) {
        const totalCounted = params.countedDinheiro + params.countedDebito + params.countedCredito + params.countedPix;
        const totalExpected = Number(offlineSession.opening_balance) + Number(offlineSession.total_dinheiro || 0) + Number(offlineSession.total_debito || 0) + Number(offlineSession.total_credito || 0) + Number(offlineSession.total_pix || 0) + Number(offlineSession.total_suprimento || 0) - Number(offlineSession.total_sangria || 0);
        offlineSession.status = "fechado"; offlineSession.closed_by = params.userId; offlineSession.closed_at = new Date().toISOString();
        offlineSession.closing_balance = totalCounted; offlineSession.counted_dinheiro = params.countedDinheiro; offlineSession.counted_debito = params.countedDebito;
        offlineSession.counted_credito = params.countedCredito; offlineSession.counted_pix = params.countedPix; offlineSession.difference = totalCounted - totalExpected;
        offlineSession.notes = params.notes || null; saveOfflineSession(null);
        queueOfflineMovement({ action: "close", params, created_at: new Date().toISOString() });
        return offlineSession;
      }
      throw new Error("Sessão não encontrada offline");
    };
    // If session ID is an offline ID, handle it locally without hitting Supabase
    if (params.sessionId.startsWith("offline_")) return closeOffline();
    try {
      const { data: session, error: sErr } = await supabase.from("cash_sessions").select("*").eq("id", params.sessionId).eq("company_id", params.companyId).single();
      if (sErr) { if (isNetworkError(sErr)) return closeOffline(); throw new Error(`Sessão não encontrada: ${sErr.message}`); }
      const totalCounted = params.countedDinheiro + params.countedDebito + params.countedCredito + params.countedPix;
      const totalExpected = Number(session.opening_balance) + Number(session.total_dinheiro || 0) + Number(session.total_debito || 0) + Number(session.total_credito || 0) + Number(session.total_pix || 0) + Number(session.total_suprimento || 0) - Number(session.total_sangria || 0);
      const { data, error } = await supabase.from("cash_sessions").update({ status: "fechado", closed_by: params.userId, closed_at: new Date().toISOString(), closing_balance: totalCounted, counted_dinheiro: params.countedDinheiro, counted_debito: params.countedDebito, counted_credito: params.countedCredito, counted_pix: params.countedPix, difference: totalCounted - totalExpected, notes: params.notes }).eq("id", params.sessionId).eq("company_id", params.companyId).select().single();
      if (error) { if (isNetworkError(error)) return closeOffline(); throw new Error(`Erro ao fechar caixa: ${error.message}`); }
      await supabase.from("cash_movements").insert({ company_id: params.companyId, session_id: params.sessionId, type: "fechamento", amount: totalCounted, performed_by: params.userId, description: `Fechamento - Diferença: ${(totalCounted - totalExpected).toFixed(2)}` });
      logAction({ companyId: params.companyId, userId: params.userId, action: "Caixa fechado", module: "caixa", details: `Contagem: R$ ${totalCounted.toFixed(2)} | Diferença: R$ ${(totalCounted - totalExpected).toFixed(2)}` });
      saveOfflineSession(null);
      return data;
    } catch (err: unknown) {
      if (isNetworkError(err)) return closeOffline();
      throw err;
    }
  }

  static async registerMovement(params: { companyId: string; userId: string; sessionId: string; type: "sangria" | "suprimento"; amount: number; description?: string }) {
    const moveOffline = () => {
      const offlineSession = getOfflineSession();
      if (offlineSession) {
        const field = (params.type === "sangria" ? "total_sangria" : "total_suprimento") as "total_sangria" | "total_suprimento";
        offlineSession[field] = Number(offlineSession[field] ?? 0) + params.amount;
        saveOfflineSession(offlineSession);
        queueOfflineMovement({ action: "movement", params, created_at: new Date().toISOString() });
        return { id: `offline_mv_${Date.now()}`, ...params };
      }
      throw new Error("Sessão offline não encontrada");
    };
    try {
      const { data, error } = await supabase.from("cash_movements").insert({ company_id: params.companyId, session_id: params.sessionId, type: params.type, amount: params.amount, performed_by: params.userId, description: params.description }).select().single();
      if (error) { if (isNetworkError(error)) return moveOffline(); throw new Error(`Erro na movimentação: ${error.message}`); }
      logAction({ companyId: params.companyId, userId: params.userId, action: params.type === "sangria" ? "Sangria registrada" : "Suprimento registrado", module: "caixa", details: `R$ ${params.amount} - ${params.description || ""}` });
      const field = params.type === "sangria" ? "total_sangria" : "total_suprimento";
      const { data: session } = await supabase.from("cash_sessions").select(field).eq("id", params.sessionId).eq("company_id", params.companyId).single();
      if (session) await supabase.from("cash_sessions").update({ [field]: Number(session[field] || 0) + params.amount }).eq("id", params.sessionId).eq("company_id", params.companyId);
      return data;
    } catch (err: unknown) {
      if (isNetworkError(err)) return moveOffline();
      throw err;
    }
  }

  static async getCurrentSession(companyId: string, terminalId?: string) {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const offlineSession = getOfflineSession();
      if (offlineSession && offlineSession.company_id === companyId && offlineSession.status === "aberto") {
        if (!terminalId || offlineSession.terminal_id === terminalId) return offlineSession;
      }
      return null;
    }
    try {
      let query = supabase.from("cash_sessions").select("*").eq("company_id", companyId).eq("status", "aberto");
      if (terminalId) query = query.eq("terminal_id", terminalId);
      const { data, error } = await query.order("opened_at", { ascending: false }).limit(1).maybeSingle();
      if (error) { const offlineSession = getOfflineSession(); if (offlineSession && offlineSession.company_id === companyId && offlineSession.status === "aberto") { if (!terminalId || offlineSession.terminal_id === terminalId) return offlineSession; } return null; }
      if (data) saveOfflineSession(data);
      return data;
    } catch {
      const offlineSession = getOfflineSession();
      if (offlineSession && offlineSession.company_id === companyId && offlineSession.status === "aberto") {
        if (!terminalId || offlineSession.terminal_id === terminalId) return offlineSession;
      }
      return null;
    }
  }
}
