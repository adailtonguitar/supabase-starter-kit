import { useEffect, useState, createContext, useContext } from "react";
import { supabase } from "@/integrations/supabase/client";
import { setErrorTrackerUser } from "@/services/ErrorTracker";
import { logAction } from "@/services/ActionLogger";
import { identifyUser } from "@/lib/analytics";
import type { User, Session } from "@supabase/supabase-js";

const AUTH_CACHE_KEY = "as_cached_user";

function cacheUser(user: User | null) {
  try {
    if (user) {
      localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify({ id: user.id, email: user.email, role: user.role }));
    } else {
      localStorage.removeItem(AUTH_CACHE_KEY);
    }
  } catch { /* quota */ }
}

function getCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(AUTH_CACHE_KEY);
    if (raw) return JSON.parse(raw) as User;
  } catch { /* parse error */ }
  return null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Restore cached user immediately so offline loads work
  const [user, setUser] = useState<User | null>(() => getCachedUser());
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let authResolved = false;
    let mounted = true;
    let subscription: ReturnType<typeof supabase.auth.onAuthStateChange>["data"]["subscription"] | null = null;

    const applyAuthState = (nextSession: Session | null) => {
      if (!mounted) return;
      authResolved = true;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      cacheUser(nextSession?.user ?? null);
      setErrorTrackerUser(nextSession?.user?.id ?? null, nextSession?.user?.email ?? null);
      identifyUser(nextSession?.user?.id ?? null);
      setLoading(false);
    };

    const clearAuthState = () => {
      if (!mounted) return;
      authResolved = true;
      setSession(null);
      setUser(null);
      cacheUser(null);
      setErrorTrackerUser(null, null);
      identifyUser(null);
      setLoading(false);
    };

    // Intercept recovery/invite hash BEFORE Supabase clears it
    const hash = window.location.hash;
    if (hash) {
      const hashParams = new URLSearchParams(hash.substring(1));
      const type = hashParams.get("type");
      if (type === "recovery" || type === "invite" || type === "magiclink") {
        sessionStorage.setItem("needs-password-setup", "true");
      }
    }

    void supabase.auth.getSession().then(({ data: { session } }) => {
      applyAuthState(session);

      const authSub = supabase.auth.onAuthStateChange((event, nextSession) => {
        if (event === "INITIAL_SESSION") return;

        if (event === "PASSWORD_RECOVERY") {
          sessionStorage.setItem("needs-password-setup", "true");
        }
        if (event === "SIGNED_IN" && nextSession?.user) {
          void supabase.from("company_users").select("company_id").eq("user_id", nextSession.user.id).limit(1).single()
            .then(({ data }) => {
              if (data?.company_id) logAction({ companyId: data.company_id, userId: nextSession.user.id, action: "Login realizado", module: "auth" });
            });
        }
        applyAuthState(nextSession);
      });

      subscription = authSub.data.subscription;
    }).catch(() => {
      if (!navigator.onLine && getCachedUser()) {
        authResolved = true;
        setLoading(false);
      } else {
        clearAuthState();
      }
    });

    // Safety timeout: if auth never resolves in 8s, clear stale cached auth online.
    const timeout = setTimeout(() => {
      if (authResolved) return;

      if (!navigator.onLine && getCachedUser()) {
        authResolved = true;
        setLoading(false);
        return;
      }

      clearAuthState();
    }, 8000);

    return () => {
      mounted = false;
      subscription?.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const signOut = async () => {
    // Log logout before clearing session
    if (user) {
      const cached = localStorage.getItem("as_cached_company") || localStorage.getItem("as_selected_company");
      if (cached) {
        try {
          const companyId = JSON.parse(cached)?.id || cached;
          logAction({ companyId, userId: user.id, action: "Logout realizado", module: "auth" });
        } catch { /* best effort */ }
      }
    }
    // Invalidate session token before signing out
    try {
      const token = sessionStorage.getItem("as_session_token");
      if (token) {
        await supabase.rpc("invalidate_session", { p_session_token: token });
        sessionStorage.removeItem("as_session_token");
      }
    } catch { /* best effort */ }
    cacheUser(null);
    localStorage.removeItem("as_cached_company");
    localStorage.removeItem("as_selected_company");
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
