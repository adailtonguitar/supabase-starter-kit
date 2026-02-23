import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useCompany() {
  const { user } = useAuth();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setCompanyId(null);
      setLoading(false);
      return;
    }

    const fetchCompany = async () => {
      try {
        const { data } = await supabase
          .from("company_users")
          .select("company_id")
          .eq("user_id", user.id)
          .eq("active", true)
          .limit(1)
          .single();

        setCompanyId(data?.company_id ?? null);
      } catch {
        setCompanyId(null);
      }
      setLoading(false);
    };

    fetchCompany();
  }, [user]);

  return { companyId, loading };
}
