import { useEffect, useState, createContext, useContext } from "react";
import { supabase } from "@/integrations/supabase/client";
import { setErrorTrackerUser } from "@/services/ErrorTracker";
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
    // Intercept recovery/invite hash BEFORE Supabase clears it
    const hash = window.location.hash;
    if (hash) {
      const hashParams = new URLSearchParams(hash.substring(1));
      const type = hashParams.get("type");
      if (type === "recovery" || type === "invite" || type === "magiclink") {
        sessionStorage.setItem("needs-password-setup", "true");
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        sessionStorage.setItem("needs-password-setup", "true");
      }
      setSession(session);
      setUser(session?.user ?? null);
      cacheUser(session?.user ?? null);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      cacheUser(session?.user ?? null);
      setLoading(false);
    }).catch(() => {
      if (!navigator.onLine && getCachedUser()) {
        // Offline — using cached user
      } else {
        setSession(null);
        setUser(null);
        cacheUser(null);
      }
      setLoading(false);
    });

    // Safety timeout: if auth never resolves in 8s, stop loading
    const timeout = setTimeout(() => {
      setLoading((prev) => {
        if (prev) return false;
        return prev;
      });
    }, 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const signOut = async () => {
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
    localStorage.removeItem("as_cached_admin_role");
    localStorage.removeItem("as_selected_company");
    localStorage.removeItem("as_cached_role");
    localStorage.removeItem("as_cached_max_discount");
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
