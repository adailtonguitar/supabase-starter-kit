import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";

const DEFAULT_WHATSAPP = "";

export function useWhatsAppSupport() {
  const { companyId, loading: companyLoading } = useCompany();
  const [whatsappNumber, setWhatsappNumber] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (companyLoading) return;
    if (!companyId) {
      setWhatsappNumber(DEFAULT_WHATSAPP || null);
      setLoading(false);
      return;
    }

    const fetchNumber = async () => {
      try {
        const { data: company } = await supabase
          .from("companies")
          .select("whatsapp_support")
          .eq("id", companyId)
          .single();

        if (company?.whatsapp_support) {
          setWhatsappNumber(company.whatsapp_support);
          setLoading(false);
          return;
        }

        const { data: license } = await supabase
          .from("reseller_licenses")
          .select("reseller_id")
          .eq("company_id", companyId)
          .eq("status", "active")
          .limit(1)
          .maybeSingle();

        if (license?.reseller_id) {
          const { data: reseller } = await supabase
            .from("resellers")
            .select("whatsapp_support, phone")
            .eq("id", license.reseller_id)
            .single();

          if (reseller?.whatsapp_support) {
            setWhatsappNumber(reseller.whatsapp_support);
            setLoading(false);
            return;
          }
          if (reseller?.phone) {
            setWhatsappNumber(reseller.phone);
            setLoading(false);
            return;
          }
        }

        setWhatsappNumber(DEFAULT_WHATSAPP || null);
      } catch (err) {
        console.error("[useWhatsAppSupport] Error:", err);
        setWhatsappNumber(DEFAULT_WHATSAPP || null);
      }
      setLoading(false);
    };

    fetchNumber();
  }, [companyId, companyLoading]);

  const openWhatsApp = (message?: string) => {
    if (!whatsappNumber) return;
    const cleaned = whatsappNumber.replace(/\D/g, "");
    const fullNumber = cleaned.startsWith("55") ? cleaned : `55${cleaned}`;
    const url = `https://wa.me/${fullNumber}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
    window.open(url, "_blank");
  };

  return { whatsappNumber, loading, openWhatsApp };
}
