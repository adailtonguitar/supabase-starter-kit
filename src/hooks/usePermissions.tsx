import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useCompany } from "./useCompany";

export function usePermissions() {
  const { user } = useAuth();
  const { companyId } = useCompany();
  const [role, setRole] = useState<string>("caixa");
  const [maxDiscountPercent, setMaxDiscountPercent] = useState(0);

  useEffect(() => {
    if (!user || !companyId) {
      setRole("caixa");
      setMaxDiscountPercent(0);
      return;
    }

    const fetch = async () => {
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

        // Fetch discount limits for this role
        const { data: limits } = await supabase
          .from("discount_limits")
          .select("max_discount_percent")
          .eq("company_id", companyId)
          .eq("role", userRole)
          .maybeSingle();

        if (limits) {
          setMaxDiscountPercent(limits.max_discount_percent);
        } else {
          // Default discount by role
          setMaxDiscountPercent(userRole === "admin" ? 100 : userRole === "gerente" ? 50 : userRole === "supervisor" ? 20 : 5);
        }
      } catch {
        setRole("caixa");
        setMaxDiscountPercent(0);
      }
    };
    fetch();
  }, [user, companyId]);

  const canEdit = (module: string) => {
    if (role === "admin" || role === "gerente") return true;
    if (role === "supervisor") return !["configuracoes", "usuarios"].includes(module);
    return false;
  };

  return { role, permissions: [] as string[], maxDiscountPercent, canEdit };
}
