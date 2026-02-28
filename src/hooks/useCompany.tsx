import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

const COMPANY_CACHE_KEY = "as_cached_company";
const SELECTED_COMPANY_KEY = "as_selected_company";
interface CachedCompany {
  companyId: string;
  companyName: string | null;
  logoUrl: string | null;
  slogan: string | null;
  pixKey: string | null;
  pixKeyType: string | null;
  pixCity: string | null;
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

interface CompanyData {
  companyId: string | null;
  companyName: string | null;
  logoUrl: string | null;
  slogan: string | null;
  pixKey: string | null;
  pixKeyType: string | null;
  pixCity: string | null;
  loading: boolean;
  switchCompany: (companyId: string) => void;
}

export function useCompany(): CompanyData {
  const { user } = useAuth();
  const cached = getCachedCompany();
  const [companyId, setCompanyId] = useState<string | null>(cached?.companyId ?? null);
  const [companyName, setCompanyName] = useState<string | null>(cached?.companyName ?? null);
  const [logoUrl, setLogoUrl] = useState<string | null>(cached?.logoUrl ?? null);
  const [slogan, setSlogan] = useState<string | null>(cached?.slogan ?? null);
  const [pixKey, setPixKey] = useState<string | null>(cached?.pixKey ?? null);
  const [pixKeyType, setPixKeyType] = useState<string | null>(cached?.pixKeyType ?? null);
  const [pixCity, setPixCity] = useState<string | null>(cached?.pixCity ?? null);
  const [loading, setLoading] = useState(true);
  const retryCount = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    retryCount.current = 0;
    if (retryTimer.current) clearTimeout(retryTimer.current);

    if (!user) {
      setCompanyId(null);
      setCompanyName(null);
      setLogoUrl(null);
      setSlogan(null);
      setPixKey(null);
      setPixKeyType(null);
      setPixCity(null);
      setLoading(false);
      return;
    }

    // If offline and we have cached data, use it immediately
    if (!navigator.onLine && cached?.companyId) {
      console.log("[useCompany] Offline — using cached company data");
      setCompanyId(cached.companyId);
      setCompanyName(cached.companyName);
      setLogoUrl(cached.logoUrl);
      setSlogan(cached.slogan);
      setPixKey(cached.pixKey);
      setPixKeyType(cached.pixKeyType);
      setPixCity(cached.pixCity);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchCompany = async (targetCompanyId?: string) => {
      try {
        // If a specific company is selected, use that
        const selectedId = targetCompanyId || localStorage.getItem(SELECTED_COMPANY_KEY);
        
        let resolvedCompanyId: string | null = null;

        if (selectedId) {
          // Verify user has access to this company
          const { data: check } = await supabase
            .from("company_users")
            .select("company_id")
            .eq("user_id", user.id)
            .eq("company_id", selectedId)
            .eq("is_active", true)
            .maybeSingle();
          if (check) {
            resolvedCompanyId = check.company_id;
          } else {
            // Selected company no longer valid — clear stale selection
            localStorage.removeItem(SELECTED_COMPANY_KEY);
          }
        }

        if (!resolvedCompanyId) {
          const { data: cuData, error: cuError } = await supabase
            .from("company_users")
            .select("company_id")
            .eq("user_id", user.id)
            .eq("is_active", true)
            .limit(1)
            .single();

          if (cancelled) return;

          if (cuError || !cuData?.company_id) {
            if (retryCount.current < 3) {
              retryCount.current++;
              const delay = retryCount.current * 1500;
              console.warn(`[useCompany] Retry ${retryCount.current}/3 in ${delay}ms`);
              retryTimer.current = setTimeout(() => {
                if (!cancelled) fetchCompany();
              }, delay);
              return;
            }
            setCompanyId(null);
            setLoading(false);
            return;
          }
          resolvedCompanyId = cuData.company_id;
        }

        if (cancelled) return;
        setCompanyId(resolvedCompanyId);

        const { data: company } = await supabase
          .from("companies")
          .select("name, logo_url, slogan, pix_key, pix_key_type, pix_city, address_city")
          .eq("id", resolvedCompanyId)
          .single();

        if (cancelled) return;

        const name = company?.name ?? null;
        const logo = company?.logo_url ?? null;
        const s = (company as any)?.slogan ?? null;
        const pk = (company as any)?.pix_key ?? null;
        const pkt = (company as any)?.pix_key_type ?? null;
        const pc = (company as any)?.pix_city || (company as any)?.address_city || null;

        setCompanyName(name);
        setLogoUrl(logo);
        setSlogan(s);
        setPixKey(pk);
        setPixKeyType(pkt);
        setPixCity(pc);

        cacheCompany({
          companyId: resolvedCompanyId,
          companyName: name,
          logoUrl: logo,
          slogan: s,
          pixKey: pk,
          pixKeyType: pkt,
          pixCity: pc,
        });
      } catch (err) {
        console.error("[useCompany] Failed to fetch company:", err);
        if (!cancelled && retryCount.current < 3) {
          retryCount.current++;
          retryTimer.current = setTimeout(() => {
            if (!cancelled) fetchCompany();
          }, retryCount.current * 1500);
          return;
        }
        if (!navigator.onLine && cached?.companyId) {
          setCompanyId(cached.companyId);
        } else {
          setCompanyId(null);
        }
      }
      if (!cancelled) setLoading(false);
    };

    fetchCompany();

    return () => {
      cancelled = true;
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [user]);

  const switchCompany = useCallback((newCompanyId: string) => {
    localStorage.setItem(SELECTED_COMPANY_KEY, newCompanyId);
    // Force re-fetch by updating state
    setCompanyId(newCompanyId);
    setLoading(true);
    // Fetch the new company details
    (async () => {
      const { data: company } = await supabase
        .from("companies")
        .select("name, logo_url, slogan, pix_key, pix_key_type, pix_city, address_city")
        .eq("id", newCompanyId)
        .single();
      
      const name = company?.name ?? null;
      const logo = company?.logo_url ?? null;
      setCompanyName(name);
      setLogoUrl(logo);
      setSlogan((company as any)?.slogan ?? null);
      setPixKey((company as any)?.pix_key ?? null);
      setPixKeyType((company as any)?.pix_key_type ?? null);
      setPixCity((company as any)?.pix_city || (company as any)?.address_city || null);
      
      cacheCompany({
        companyId: newCompanyId,
        companyName: name,
        logoUrl: logo,
        slogan: (company as any)?.slogan ?? null,
        pixKey: (company as any)?.pix_key ?? null,
        pixKeyType: (company as any)?.pix_key_type ?? null,
        pixCity: (company as any)?.pix_city || (company as any)?.address_city || null,
      });
      setLoading(false);
    })();
  }, []);

  return { companyId, companyName, logoUrl, slogan, pixKey, pixKeyType, pixCity, loading, switchCompany };
}
