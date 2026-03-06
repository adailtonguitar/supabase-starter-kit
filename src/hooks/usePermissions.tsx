import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useCompany } from "./useCompany";

export function usePermissions() {
  const { user } = useAuth();
  const { companyId } = useCompany();
  const [role, setRole] = useState<string>(() => {
    try { return localStorage.getItem("as_cached_role") || "caixa"; } catch { return "caixa"; }
  });
  const [maxDiscountPercent, setMaxDiscountPercent] = useState(() => {
    try { return Number(localStorage.getItem("as_cached_max_discount")) || 0; } catch { return 0; }
  });
  const checkedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user || !companyId) {
      setRole("caixa");
      setMaxDiscountPercent(0);
      checkedRef.current = null;
      return;
    }

    const cacheKey = `${user.id}_${companyId}`;
    if (checkedRef.current === cacheKey) return;

    const fetchPermissions = async () => {
      try {
        const { data } = await supabase
          .from("company_users")
          .select("role")
          .eq("user_id", user.id)
          .eq("company_id", companyId)
          .eq("is_active", true)
          .maybeSingle();

        const userRole = data?.role || "caixa";
        setRole(userRole);
        try { localStorage.setItem("as_cached_role", userRole); } catch {}

        const { data: limits } = await supabase
          .from("discount_limits")
          .select("max_discount_percent")
          .eq("company_id", companyId)
          .eq("role", userRole)
          .maybeSingle();

        const discount = limits
          ? limits.max_discount_percent
          : userRole === "admin" ? 100 : userRole === "gerente" ? 50 : userRole === "supervisor" ? 20 : 5;
        setMaxDiscountPercent(discount);
        try { localStorage.setItem("as_cached_max_discount", String(discount)); } catch {}
      } catch {
        setRole("caixa");
        setMaxDiscountPercent(0);
      }
      checkedRef.current = cacheKey;
    };
    fetchPermissions();
  }, [user, companyId]);

  const canEdit = (module: string) => {
    if (role === "admin" || role === "gerente") return true;
    if (role === "supervisor") return !["configuracoes", "usuarios"].includes(module);
    return false;
  };

  return { role, permissions: [] as string[], maxDiscountPercent, canEdit };
}
