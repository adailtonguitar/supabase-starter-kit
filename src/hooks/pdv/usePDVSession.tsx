/**
 * usePDVSession — Cash-session loading (online + offline fallback).
 */
import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CashSession {
  id: string;
  terminal_id: string;
  opened_at: string;
  initial_amount: number;
}

export function usePDVSession(companyId: string | null) {
  const [currentSession, setCurrentSession] = useState<CashSession | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [sessionEverLoaded, setSessionEverLoaded] = useState(false);

  const loadOfflineSession = useCallback((terminalId: string): boolean => {
    try {
      const raw = localStorage.getItem("as_offline_cash_session");
      if (raw) {
        const offlineSession = JSON.parse(raw);
        const companyMatch = !companyId || offlineSession?.company_id === companyId;
        if (companyMatch && offlineSession?.terminal_id === terminalId && offlineSession?.status === "aberto") {
          setCurrentSession(offlineSession as CashSession);
          return true;
        }
      }
    } catch {}
    return false;
  }, [companyId]);

  const reloadSession = useCallback(async (terminalId: string) => {
    setLoadingSession(true);
    try {
      if (!companyId) { setCurrentSession(null); return; }

      if (!navigator.onLine) {
        if (!loadOfflineSession(terminalId)) setCurrentSession(null);
        return;
      }

      const { data, error } = await supabase
        .from("cash_sessions")
        .select("*")
        .eq("company_id", companyId)
        .eq("terminal_id", terminalId)
        .eq("status", "aberto")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setCurrentSession(data as CashSession | null);
        try {
          localStorage.setItem("as_offline_cash_session", JSON.stringify({
            ...data, company_id: companyId, status: "aberto",
          }));
        } catch {}
      } else {
        try { localStorage.removeItem("as_offline_cash_session"); } catch {}
        setCurrentSession(null);
      }
    } catch {
      if (!loadOfflineSession(terminalId)) setCurrentSession(null);
    } finally {
      setLoadingSession(false);
      setSessionEverLoaded(true);
    }
  }, [companyId, loadOfflineSession]);

  return { currentSession, loadingSession, sessionEverLoaded, reloadSession };
}
