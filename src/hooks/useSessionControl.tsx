import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";

const SESSION_TOKEN_KEY = "as_session_token";
const HEARTBEAT_INTERVAL = 5 * 60 * 1000; // 5 min
const VALIDATION_INTERVAL = 5 * 60 * 1000; // 5 min

function generateSessionToken(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getDeviceInfo(): string {
  const ua = navigator.userAgent;
  const isMobile = /Mobi|Android/i.test(ua);
  const browser = /Chrome/.test(ua) ? "Chrome" : /Firefox/.test(ua) ? "Firefox" : /Safari/.test(ua) ? "Safari" : "Other";
  return `${isMobile ? "Mobile" : "Desktop"} - ${browser}`;
}

function getStoredToken(): string | null {
  try { return sessionStorage.getItem(SESSION_TOKEN_KEY); } catch { return null; }
}

function storeToken(token: string) {
  try { sessionStorage.setItem(SESSION_TOKEN_KEY, token); } catch { /* */ }
}

function clearToken() {
  try { sessionStorage.removeItem(SESSION_TOKEN_KEY); } catch { /* */ }
}

export function useSessionControl() {
  const { user, signOut } = useAuth();
  const { companyId } = useCompany();
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const validationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const registeredRef = useRef(false);

  const registerSession = useCallback(async () => {
    if (!user || !companyId || registeredRef.current) return;

    // Don't re-register if we already have a token for this tab
    const existingToken = getStoredToken();
    if (existingToken) {
      registeredRef.current = true;
      return;
    }

    const token = generateSessionToken();
    const device = getDeviceInfo();

    try {
      const { data, error } = await supabase.rpc("register_session", {
        p_user_id: user.id,
        p_company_id: companyId,
        p_session_token: token,
        p_device_info: device,
        p_ip_address: null, // IP is captured server-side if needed
      });

      if (error) {
        console.error("[SessionControl] Register failed:", error);
        return;
      }

      storeToken(token);
      registeredRef.current = true;

      const result = data as any;
      if (result?.action === "replaced_oldest") {
        toast.info("Uma sessão anterior foi encerrada para liberar esta.", { duration: 5000 });
      }
    } catch (err) {
      console.error("[SessionControl] Register error:", err);
    }
  }, [user, companyId]);

  const validateSession = useCallback(async () => {
    const token = getStoredToken();
    if (!token || !user) return;

    try {
      const { data, error } = await supabase.rpc("validate_session", {
        p_session_token: token,
      });

      if (error) {
        console.error("[SessionControl] Validation error:", error);
        return;
      }

      const result = data as any;
      if (result && !result.valid) {
        toast.error(result.reason || "Sua sessão foi encerrada.", { duration: 8000 });
        clearToken();
        registeredRef.current = false;
        // Force logout after brief delay
        setTimeout(() => signOut(), 3000);
      }
    } catch {
      // Network error — don't force logout
    }
  }, [user, signOut]);

  const invalidateSession = useCallback(async () => {
    const token = getStoredToken();
    if (!token) return;

    try {
      await supabase.rpc("invalidate_session", { p_session_token: token });
    } catch {
      // Best effort
    }
    clearToken();
    registeredRef.current = false;
  }, []);

  // Register on login
  useEffect(() => {
    if (user && companyId) {
      registerSession();
    } else {
      registeredRef.current = false;
    }
  }, [user, companyId, registerSession]);

  // Heartbeat: update last_activity
  useEffect(() => {
    if (!user || !companyId) return;

    heartbeatRef.current = setInterval(async () => {
      const token = getStoredToken();
      if (token) {
        try { await supabase.rpc("validate_session", { p_session_token: token }); } catch { /* */ }
      }
    }, HEARTBEAT_INTERVAL);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [user, companyId]);

  // Periodic validation: check if session was invalidated
  useEffect(() => {
    if (!user) return;

    validationRef.current = setInterval(validateSession, VALIDATION_INTERVAL);

    return () => {
      if (validationRef.current) clearInterval(validationRef.current);
    };
  }, [user, validateSession]);

  // Cleanup on tab close
  useEffect(() => {
    const handleUnload = () => {
      const token = getStoredToken();
      if (token) {
        // Use sendBeacon for reliability on tab close
        const url = `${import.meta.env.VITE_SUPABASE_URL || "https://fsvxpxziotklbxkivyug.supabase.co"}/rest/v1/rpc/invalidate_session`;
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzdnhweHppb3RrbGJ4a2l2eXVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODU5NTMsImV4cCI6MjA4NzM2MTk1M30.8I3ABsRZBZuE1IpK_g9z3PdRUd9Omt_F5qNx0Pgqvyo";
        navigator.sendBeacon(url, JSON.stringify({ p_session_token: token }));
      }
    };

    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  return { invalidateSession };
}
