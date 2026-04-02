import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyCompanyMemberships } from "@/lib/company-memberships";
import { PRODUCTS_ACTIVE_OR_LEGACY_NULL } from "@/lib/product-active-filter";
import { useAuth } from "./useAuth";

const COMPANY_CACHE_KEY = "as_cached_company";
const SELECTED_COMPANY_KEY = "as_selected_company";

const COMPANY_SELECT = "name, logo_url, slogan, pix_key, pix_key_type, pix_city, address_city, address_street, address_number, address_neighborhood, address_state, cnpj, ie, phone, tax_regime, pdv_auto_emit_nfce";

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
  taxRegime: string | null;
  pdvAutoEmitNfce: boolean;
}

type CompanyRow = {
  name?: string | null;
  logo_url?: string | null;
  slogan?: string | null;
  pix_key?: string | null;
  pix_key_type?: string | null;
  pix_city?: string | null;
  address_city?: string | null;
  address_street?: string | null;
  address_number?: string | null;
  address_neighborhood?: string | null;
  address_state?: string | null;
  cnpj?: string | null;
  ie?: string | null;
  phone?: string | null;
  tax_regime?: string | null;
  pdv_auto_emit_nfce?: boolean | null;
};

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

/** Ordena tenants ativos por volume (vendas, depois produtos) — primeiro = operação principal na prática. */
async function rankActiveCompanyIdsByActivity(activeIds: string[]): Promise<string[]> {
  if (activeIds.length <= 1) return [...activeIds];
  const scored = await Promise.all(
    activeIds.map(async (id) => {
      const [{ count: salesC }, { count: productsC }] = await Promise.all([
        supabase.from("sales").select("id", { count: "exact", head: true }).eq("company_id", id),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("company_id", id).or(PRODUCTS_ACTIVE_OR_LEGACY_NULL),
      ]);
      const s = salesC ?? 0;
      const p = productsC ?? 0;
      return { id, score: s * 1_000_000 + p };
    }),
  );
  scored.sort((a, b) => b.score - a.score);
  return scored.map((x) => x.id);
}

/** Uma rodada de rede: ranking + linhas de companies em paralelo (evita estourar timeout de rota). */
async function resolveActiveCompany(
  activeIds: string[],
  preferredFirst: string | null,
): Promise<{ id: string; row: CompanyRow | null }> {
  if (activeIds.length === 0) return { id: "", row: null };

  const ranked = await rankActiveCompanyIdsByActivity(activeIds);
  let chosen =
    preferredFirst && activeIds.includes(preferredFirst) ? preferredFirst : ranked[0];

  if (activeIds.length > 1 && ranked.length >= 2) {
    const bestId = ranked[0];
    if (chosen !== bestId) {
      const [{ count: curS }, { count: bestS }, { count: curP }, { count: bestP }] = await Promise.all([
        supabase.from("sales").select("id", { count: "exact", head: true }).eq("company_id", chosen),
        supabase.from("sales").select("id", { count: "exact", head: true }).eq("company_id", bestId),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("company_id", chosen).or(PRODUCTS_ACTIVE_OR_LEGACY_NULL),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("company_id", bestId).or(PRODUCTS_ACTIVE_OR_LEGACY_NULL),
      ]);
      const switchForSales = (curS ?? 0) === 0 && (bestS ?? 0) >= 1;
      const switchForProducts =
        (curS ?? 0) === 0 && (bestS ?? 0) === 0 && (curP ?? 0) === 0 && (bestP ?? 0) >= 1;
      if (switchForSales || switchForProducts) {
        chosen = bestId;
        try {
          localStorage.removeItem(SELECTED_COMPANY_KEY);
        } catch {
          /* */
        }
      }
    }
  }

  const tryIds = [...new Set([chosen, ...ranked].filter((id) => activeIds.includes(id)))];
  const results = await Promise.all(
    tryIds.map((id) =>
      supabase.from("companies").select(COMPANY_SELECT).eq("id", id).maybeSingle(),
    ),
  );

  for (let i = 0; i < tryIds.length; i++) {
    const { data, error } = results[i];
    if (!error && data) {
      if (tryIds[i] !== chosen) {
        try {
          localStorage.removeItem(SELECTED_COMPANY_KEY);
        } catch {
          /* */
        }
      }
      return { id: tryIds[i], row: data as CompanyRow };
    }
  }

  // Mantém o tenant para products/sales mesmo se SELECT em companies falhar (RLS pontual); formulário Empresa pode ficar vazio.
  return { id: chosen, row: null };
}

function extractCompanyFields(company: CompanyRow | null | undefined): Omit<CachedCompany, 'companyId'> {
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
    taxRegime: company?.tax_regime ?? null,
    pdvAutoEmitNfce: company?.pdv_auto_emit_nfce ?? true,
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
  taxRegime: string | null;
  pdvAutoEmitNfce: boolean;
  loading: boolean;
  switchCompany: (companyId: string) => void;
}

const nullFields: Omit<CachedCompany, 'companyId'> = {
  companyName: null, logoUrl: null, slogan: null, pixKey: null, pixKeyType: null, pixCity: null,
  cnpj: null, ie: null, phone: null, addressStreet: null, addressNumber: null, addressNeighborhood: null, addressCity: null, addressState: null, taxRegime: null, pdvAutoEmitNfce: true,
};

export function useCompany(): CompanyData {
  const { user, session } = useAuth();
  const cached = getCachedCompany();
  const [companyId, setCompanyId] = useState<string | null>(cached?.companyId ?? null);
  const [fields, setFields] = useState<Omit<CachedCompany, 'companyId'>>(cached ? { ...nullFields, ...cached } : nullFields);
  const [loading, setLoading] = useState(true);
  const retryCount = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout>>();

  const applyCompany = useCallback((resolvedId: string, company: CompanyRow | null | undefined) => {
    const f = extractCompanyFields(company);
    setCompanyId(resolvedId);
    setFields(f);
    cacheCompany({ companyId: resolvedId, ...f });
  }, []);

  useEffect(() => {
    retryCount.current = 0;
    if (retryTimer.current) clearTimeout(retryTimer.current);

    if (!user || !session) {
      setCompanyId(null);
      setFields(nullFields);
      setLoading(false);
      return;
    }

    if (!navigator.onLine && cached?.companyId) {
      // console.log("[useCompany] Offline — using cached company data");
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

        const memberships = await fetchMyCompanyMemberships(user.id);
        if (cancelled) return;

        if (selectedId) {
          const sel = memberships.find((m) => m.company_id === selectedId && m.is_active);
          if (sel) resolvedCompanyId = selectedId;
          else localStorage.removeItem(SELECTED_COMPANY_KEY);
        }

        const activeIds = memberships.filter((m) => m.is_active).map((m) => m.company_id);
        if (activeIds.length === 0) {
          if (retryCount.current < 3) {
            retryCount.current++;
            retryTimer.current = setTimeout(() => { if (!cancelled) fetchCompany(); }, Math.min(400 * retryCount.current, 1200));
            return;
          }
          setCompanyId(null);
          setFields(nullFields);
          if (!cancelled) setLoading(false);
          return;
        }

        const preferred = resolvedCompanyId ?? null;
        const { id: finalId, row } = await resolveActiveCompany(activeIds, preferred);
        if (cancelled) return;

        if (!finalId) {
          setCompanyId(null);
          setFields(nullFields);
        } else {
          applyCompany(finalId, row);
        }
      } catch (err) {
        console.error("[useCompany] Failed to fetch company:", err);
        if (!cancelled && retryCount.current < 3) {
          retryCount.current++;
          retryTimer.current = setTimeout(() => { if (!cancelled) fetchCompany(); }, Math.min(400 * retryCount.current, 1200));
          return;
        }
        if (!navigator.onLine && cached?.companyId) setCompanyId(cached.companyId);
        else setCompanyId(null);
      }
      if (!cancelled) setLoading(false);
    };

    fetchCompany();
    return () => { cancelled = true; if (retryTimer.current) clearTimeout(retryTimer.current); };
  }, [user, session, applyCompany]);

  const switchCompany = useCallback((newCompanyId: string) => {
    if (!user) return;
    setLoading(true);
    (async () => {
      const memberships = await fetchMyCompanyMemberships(user.id);
      const access = memberships.find((m) => m.company_id === newCompanyId && m.is_active);
      if (!access) { setLoading(false); return; }

      localStorage.setItem(SELECTED_COMPANY_KEY, newCompanyId);

      const activeIds = memberships.filter((m) => m.is_active).map((m) => m.company_id);
      const { id, row } = await resolveActiveCompany(activeIds, newCompanyId);
      if (id) applyCompany(id, row);
      else applyCompany(newCompanyId, null);
      setLoading(false);
    })();
  }, [user, applyCompany]);

  return { companyId, ...fields, loading, switchCompany };
}
