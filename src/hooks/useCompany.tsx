import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

const COMPANY_CACHE_KEY = "as_cached_company";
const SELECTED_COMPANY_KEY = "as_selected_company";

const COMPANY_SELECT = "name, logo_url, slogan, pix_key, pix_key_type, pix_city, address_city, address_street, address_number, address_neighborhood, address_state, cnpj, ie, phone";

interface CachedCompany {
  companyId: string;
  companyName: string | null;
  logoUrl: string | null;
  slogan: string | null;
  pixKey: string | null;
  pixKeyType: string | null;
  pixCity: string | null;
  cnpj: string | null;
  ie: string | null;
  phone: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressNeighborhood: string | null;
  addressCity: string | null;
  addressState: string | null;
}

function cacheCompany(data: CachedCompany) {
  try { localStorage.setItem(COMPANY_CACHE_KEY, JSON.stringify(data)); } catch { /* */ }
}

function getCachedCompany(): CachedCompany | null {
  try {
    const raw = localStorage.getItem(COMPANY_CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* */ }
  return null;
}

function extractCompanyFields(company: any): Omit<CachedCompany, 'companyId'> {
  return {
    companyName: company?.name ?? null,
    logoUrl: company?.logo_url ?? null,
    slogan: company?.slogan ?? null,
    pixKey: company?.pix_key ?? null,
    pixKeyType: company?.pix_key_type ?? null,
    pixCity: company?.pix_city || company?.address_city || null,
    cnpj: company?.cnpj ?? null,
    ie: company?.ie ?? null,
    phone: company?.phone ?? null,
    addressStreet: company?.address_street ?? null,
    addressNumber: company?.address_number ?? null,
    addressNeighborhood: company?.address_neighborhood ?? null,
    addressCity: company?.address_city ?? null,
    addressState: company?.address_state ?? null,
  };
}

interface CompanyData {
  companyId: string | null;
  companyName: string | null;
  logoUrl: string | null;
  slogan: string | null;
  pixKey: string | null;
  pixKeyType: string | null;
  pixCity: string | null;
  cnpj: string | null;
  ie: string | null;
  phone: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressNeighborhood: string | null;
  addressCity: string | null;
  addressState: string | null;
  loading: boolean;
  switchCompany: (companyId: string) => void;
}

const nullFields: Omit<CachedCompany, 'companyId'> = {
  companyName: null, logoUrl: null, slogan: null, pixKey: null, pixKeyType: null, pixCity: null,
  cnpj: null, ie: null, phone: null, addressStreet: null, addressNumber: null, addressNeighborhood: null, addressCity: null, addressState: null,
};

export function useCompany(): CompanyData {
  const { user } = useAuth();
  const cached = getCachedCompany();
  const [companyId, setCompanyId] = useState<string | null>(cached?.companyId ?? null);
  const [fields, setFields] = useState<Omit<CachedCompany, 'companyId'>>(cached ? { ...nullFields, ...cached } : nullFields);
  const [loading, setLoading] = useState(true);
  const retryCount = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout>>();

  const applyCompany = useCallback((resolvedId: string, company: any) => {
    const f = extractCompanyFields(company);
    setCompanyId(resolvedId);
    setFields(f);
    cacheCompany({ companyId: resolvedId, ...f });
  }, []);

  useEffect(() => {
    retryCount.current = 0;
    if (retryTimer.current) clearTimeout(retryTimer.current);

    if (!user) {
      setCompanyId(null);
      setFields(nullFields);
      setLoading(false);
      return;
    }

    if (!navigator.onLine && cached?.companyId) {
      console.log("[useCompany] Offline — using cached company data");
      setCompanyId(cached.companyId);
      setFields({ ...nullFields, ...cached });
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchCompany = async (targetCompanyId?: string) => {
      try {
        const selectedId = targetCompanyId || localStorage.getItem(SELECTED_COMPANY_KEY);
        let resolvedCompanyId: string | null = null;

        if (selectedId) {
          const { data: check } = await supabase
            .from("company_users").select("company_id")
            .eq("user_id", user.id).eq("company_id", selectedId).eq("is_active", true).maybeSingle();
          if (check) resolvedCompanyId = check.company_id;
          else localStorage.removeItem(SELECTED_COMPANY_KEY);
        }

        if (!resolvedCompanyId) {
          const { data: cuData, error: cuError } = await supabase
            .from("company_users").select("company_id")
            .eq("user_id", user.id).eq("is_active", true).limit(1).single();
          if (cancelled) return;
          if (cuError || !cuData?.company_id) {
            if (retryCount.current < 3) {
              retryCount.current++;
              retryTimer.current = setTimeout(() => { if (!cancelled) fetchCompany(); }, retryCount.current * 1500);
              return;
            }
            setCompanyId(null);
            setLoading(false);
            return;
          }
          resolvedCompanyId = cuData.company_id;
        }

        if (cancelled) return;

        const { data: company } = await supabase
          .from("companies").select(COMPANY_SELECT)
          .eq("id", resolvedCompanyId).single();

        if (cancelled) return;
        applyCompany(resolvedCompanyId, company);
      } catch (err) {
        console.error("[useCompany] Failed to fetch company:", err);
        if (!cancelled && retryCount.current < 3) {
          retryCount.current++;
          retryTimer.current = setTimeout(() => { if (!cancelled) fetchCompany(); }, retryCount.current * 1500);
          return;
        }
        if (!navigator.onLine && cached?.companyId) setCompanyId(cached.companyId);
        else setCompanyId(null);
      }
      if (!cancelled) setLoading(false);
    };

    fetchCompany();
    return () => { cancelled = true; if (retryTimer.current) clearTimeout(retryTimer.current); };
  }, [user]);

  const switchCompany = useCallback((newCompanyId: string) => {
    if (!user) return;
    setLoading(true);
    (async () => {
      const { data: access } = await supabase
        .from("company_users").select("company_id")
        .eq("user_id", user.id).eq("company_id", newCompanyId).eq("is_active", true).maybeSingle();
      if (!access) { setLoading(false); return; }

      localStorage.setItem(SELECTED_COMPANY_KEY, newCompanyId);

      const { data: company } = await supabase
        .from("companies").select(COMPANY_SELECT)
        .eq("id", newCompanyId).single();

      applyCompany(newCompanyId, company);
      setLoading(false);
    })();
  }, [user, applyCompany]);

  return { companyId, ...fields, loading, switchCompany };
}
