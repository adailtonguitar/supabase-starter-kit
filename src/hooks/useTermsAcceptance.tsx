import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useCompany } from "./useCompany";

interface TermsAcceptance {
  accepted: boolean;
  loading: boolean;
  acceptTerms: () => Promise<boolean>;
}

export function useTermsAcceptance(): TermsAcceptance {
  const { user } = useAuth();
  const { companyId } = useCompany();
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !companyId) {
      setLoading(false);
      return;
    }

    // Check localStorage cache first for instant response
    const cacheKey = `terms_accepted_${companyId}_${user.id}`;
    if (localStorage.getItem(cacheKey) === "true") {
      setAccepted(true);
      setLoading(false);
      return;
    }

    const check = async () => {
      try {
        const { data } = await supabase
          .from("terms_acceptance")
          .select("id")
          .eq("company_id", companyId)
          .eq("user_id", user.id)
          .limit(1);

        if (data && data.length > 0) {
          setAccepted(true);
          localStorage.setItem(cacheKey, "true");
        }
      } catch (err) {
        console.error("[useTermsAcceptance] check failed:", err);
        // Offline: check cache
        if (!navigator.onLine && localStorage.getItem(cacheKey) === "true") {
          setAccepted(true);
        }
      }
      setLoading(false);
    };

    check();
  }, [user, companyId]);

  const acceptTerms = useCallback(async (): Promise<boolean> => {
    if (!user || !companyId) return false;

    try {
      // Get user IP
      let ip = "unknown";
      try {
        const res = await fetch("https://api.ipify.org?format=json");
        const json = await res.json();
        ip = json.ip || "unknown";
      } catch { /* fallback */ }

      const { error } = await supabase.from("terms_acceptance").insert({
        company_id: companyId,
        user_id: user.id,
        ip_address: ip,
        user_agent: navigator.userAgent,
        terms_version: "1.0",
      });

      if (error) throw error;

      setAccepted(true);
      localStorage.setItem(`terms_accepted_${companyId}_${user.id}`, "true");
      return true;
    } catch (err) {
      console.error("[useTermsAcceptance] accept failed:", err);
      return false;
    }
  }, [user, companyId]);

  return { accepted, loading, acceptTerms };
}
