import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useAdminRole } from "@/hooks/useAdminRole";
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
  const { isSuperAdmin } = useAdminRole();
  const isDemoRef = useRef(false);
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
        // register failed silently
        return;
      }

      storeToken(token);
      registeredRef.current = true;

      const result = data as any;
      if (result?.action === "replaced_oldest") {
        toast.info("Uma sessão anterior foi encerrada para liberar esta.", { duration: 5000 });
      }
    } catch {
      // register error
    }
  }, [user, companyId]);

  const validateSession = useCallback(async () => {
    // Super admins bypass session validation entirely
    if (isSuperAdmin) return;

    const token = getStoredToken();
    if (!token || !user) return;

    try {
      const { data, error } = await supabase.rpc("validate_session", {
        p_session_token: token,
      });

      if (error) return;

      const result = data as any;
      if (result && !result.valid) {
        toast.error(result.reason || "Sua sessão foi encerrada.", { duration: 8000 });
        clearToken();
        registeredRef.current = false;
        setTimeout(() => signOut(), 3000);
      }
    } catch {
      // Network error — don't force logout
    }
  }, [user, signOut, isSuperAdmin]);

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

  // Single interval for heartbeat + validation (merged to avoid duplicate RPC calls)
  useEffect(() => {
    if (!user || !companyId) return;

    const interval = setInterval(() => {
      validateSession();
    }, HEARTBEAT_INTERVAL);

    return () => clearInterval(interval);
  }, [user, companyId, validateSession]);

  // Cleanup on tab close
  useEffect(() => {
    const handleUnload = () => {
      const token = getStoredToken();
      if (token) {
        // Use sendBeacon with proper headers via Blob for reliability on tab close
        const url = `${import.meta.env.VITE_SUPABASE_URL || ""}/rest/v1/rpc/invalidate_session`;
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
        const blob = new Blob(
          [JSON.stringify({ p_session_token: token })],
          { type: "application/json" }
        );
        // sendBeacon doesn't support custom headers, use fetch with keepalive instead
        fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": anonKey,
            "Authorization": `Bearer ${anonKey}`,
          },
          body: JSON.stringify({ p_session_token: token }),
          keepalive: true,
        }).catch(() => {});
      }
    };

    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  return { invalidateSession };
}
