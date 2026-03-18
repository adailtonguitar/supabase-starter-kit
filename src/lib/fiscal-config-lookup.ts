/**
 * Centralized fiscal config lookup — Item 13.
 * Replaces 3 divergent copy-paste config lookups across PDV, NfceEmissionDialog, and NFeEmissao.
 */
import { supabase } from "@/integrations/supabase/client";

/** Código de Regime Tributário (SEFAZ) — Item 12 */
export type CRT = 1 | 2 | 3;

export function isValidCrt(value: unknown): value is CRT {
  return value === 1 || value === 2 || value === 3;
}

export interface FiscalConfigLookupResult {
  id: string;
  doc_type: string;
  is_active: boolean;
  environment: "homologacao" | "producao";
  certificate_path: string | null;
  a3_thumbprint: string | null;
  serie: number;
  next_number: number;
  csc_id?: string | null;
  csc_token?: string | null;
}

export interface FiscalConfigWithCrt {
  config: FiscalConfigLookupResult | null;
  crt: CRT;
  isHomologacao: boolean;
  hasCert: boolean;
  allConfigs: FiscalConfigLookupResult[];
}

/**
 * Resilient fiscal config selection:
 * 1. Active NFC-e config
 * 2. Active NF-e config
 * 3. Any NFC-e config
 * 4. Any NF-e config
 * 5. First available config
 * 
 * @param preferDocType - Prefer a specific doc_type ("nfce" or "nfe")
 */
export async function getFiscalConfig(
  companyId: string,
  preferDocType: "nfce" | "nfe" = "nfce"
): Promise<FiscalConfigWithCrt> {
  const fallbackDocType = preferDocType === "nfce" ? "nfe" : "nfce";

  const [configsRes, companyRes] = await Promise.all([
    supabase
      .from("fiscal_configs")
      .select("id, doc_type, is_active, environment, certificate_path, a3_thumbprint, serie, next_number, csc_id, csc_token")
      .eq("company_id", companyId),
    supabase
      .from("companies")
      .select("crt")
      .eq("id", companyId)
      .maybeSingle(),
  ]);

  const allConfigs = (configsRes.data ?? []) as FiscalConfigLookupResult[];

  // Resilient selection: prefer active config of requested type, then fallback
  const config =
    allConfigs.find((c) => c.doc_type === preferDocType && c.is_active) ??
    allConfigs.find((c) => c.doc_type === fallbackDocType && c.is_active) ??
    allConfigs.find((c) => c.doc_type === preferDocType) ??
    allConfigs.find((c) => c.doc_type === fallbackDocType) ??
    allConfigs[0] ??
    null;

  const rawCrt = (companyRes.data as { crt?: number } | null)?.crt;
  const crt: CRT = isValidCrt(rawCrt) ? rawCrt : 1;

  const isHomologacao = config?.environment === "homologacao";
  const hasCert = !!(config?.certificate_path || config?.a3_thumbprint);

  return { config, crt, isHomologacao, hasCert, allConfigs };
}
