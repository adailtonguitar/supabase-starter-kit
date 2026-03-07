import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useAdminRole() {
  const { user } = useAuth();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
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
          .maybeSingle();
        const isAdmin = data?.role === "super_admin";
        setIsSuperAdmin(isAdmin);
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
