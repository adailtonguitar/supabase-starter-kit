import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

const CACHE_KEY = "as_cached_admin_role";

export function useAdminRole() {
  const { user } = useAuth();
  const [isSuperAdmin, setIsSuperAdmin] = useState(() => {
    try { return localStorage.getItem(CACHE_KEY) === "true"; } catch { return false; }
  });
  const [loading, setLoading] = useState(true);
  const checkedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      setIsSuperAdmin(false);
      setLoading(false);
      checkedRef.current = null;
      return;
    }

    // Skip if already checked for this user
    if (checkedRef.current === user.id) {
      setLoading(false);
      return;
    }

    const check = async () => {
      try {
        const { data } = await supabase
          .from("admin_roles")
          .select("role")
          .eq("user_id", user.id)
          .single();
        const isAdmin = data?.role === "super_admin";
        setIsSuperAdmin(isAdmin);
        try { localStorage.setItem(CACHE_KEY, String(isAdmin)); } catch {}
      } catch {
        setIsSuperAdmin(false);
      }
      checkedRef.current = user.id;
      setLoading(false);
    };
    check();
  }, [user]);

  return { isSuperAdmin, loading };
}
