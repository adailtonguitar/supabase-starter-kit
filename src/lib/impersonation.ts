import { supabase } from "@/integrations/supabase/client";

export const IMPERSONATION_KEY = "as_impersonation";

export interface ImpersonationSession {
  logId: string;
  companyId: string;
  companyName: string | null;
  startedAt: string;
  previousCompanyId?: string | null;
}

export function readImpersonation(): ImpersonationSession | null {
  try {
    const raw = sessionStorage.getItem(IMPERSONATION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ImpersonationSession;
  } catch {
    return null;
  }
}

export function writeImpersonation(session: ImpersonationSession) {
  try {
    sessionStorage.setItem(IMPERSONATION_KEY, JSON.stringify(session));
  } catch { /* ignore */ }
}

export function clearImpersonationLocal() {
  try { sessionStorage.removeItem(IMPERSONATION_KEY); } catch { /* ignore */ }
}

export async function startImpersonation(opts: {
  companyId: string;
  reason?: string;
  currentCompanyId?: string | null;
}): Promise<ImpersonationSession> {
  let ip: string | null = null;
  try {
    const res = await fetch("https://api.ipify.org?format=json");
    const json = await res.json();
    ip = json.ip ?? null;
  } catch { /* ignore */ }

  const { data, error } = await supabase.rpc("start_impersonation", {
    p_target_company_id: opts.companyId,
    p_target_user_id: null,
    p_reason: opts.reason ?? null,
    p_ip: ip,
    p_user_agent: navigator.userAgent,
  });
  if (error) throw error;

  const payload = (data ?? {}) as {
    log_id?: string;
    company_id?: string;
    company_name?: string | null;
    started_at?: string;
  };

  const session: ImpersonationSession = {
    logId: payload.log_id ?? "",
    companyId: payload.company_id ?? opts.companyId,
    companyName: payload.company_name ?? null,
    startedAt: payload.started_at ?? new Date().toISOString(),
    previousCompanyId: opts.currentCompanyId ?? null,
  };
  writeImpersonation(session);
  return session;
}

export async function endImpersonation(): Promise<ImpersonationSession | null> {
  const session = readImpersonation();
  if (!session) return null;
  try {
    await supabase.rpc("end_impersonation", { p_log_id: session.logId });
  } catch (err) {
    console.warn("[impersonation] end RPC failed:", err);
  }
  clearImpersonationLocal();
  return session;
}
