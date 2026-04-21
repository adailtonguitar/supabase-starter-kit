/**
 * _shared/feature-flags.ts
 *
 * Helper para checar feature flags dentro de edge functions.
 *
 * - Fail-open: se o RPC falhar (rede, RLS, etc.), assume ativado para não
 *   derrubar a function.
 * - Cache em memória por 30s por instância de function.
 *
 * Uso:
 *   import { isFeatureEnabled, requireFeature } from "../_shared/feature-flags.ts";
 *
 *   if (!await isFeatureEnabled(admin, "emit_nfce", companyId)) {
 *     return new Response("Emissão temporariamente indisponível", { status: 503 });
 *   }
 *
 *   // ou, helper mais agressivo:
 *   await requireFeature(admin, "ai_support", companyId);
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2?dts";

interface CacheEntry {
  value: boolean;
  expiresAt: number;
}

const CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;

function cacheKey(key: string, companyId: string | null): string {
  return `${key}::${companyId ?? "_"}`;
}

export async function isFeatureEnabled(
  admin: SupabaseClient,
  key: string,
  companyId: string | null = null,
): Promise<boolean> {
  const ck = cacheKey(key, companyId);
  const hit = CACHE.get(ck);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  try {
    const { data, error } = await admin.rpc("is_feature_enabled", {
      p_key: key,
      p_company_id: companyId,
    });

    if (error) {
      console.warn(`[feature-flags] RPC erro para "${key}":`, error.message);
      return true; // fail-open
    }

    const value = Boolean(data);
    CACHE.set(ck, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  } catch (err) {
    console.warn(`[feature-flags] exceção para "${key}":`, err);
    return true; // fail-open
  }
}

/**
 * Lança um erro HTTP-friendly se a feature estiver desligada.
 * Use no começo das edge functions para kill switch rápido.
 */
export class FeatureDisabledError extends Error {
  public readonly status = 503;
  public readonly code = "FEATURE_DISABLED";
  constructor(public readonly featureKey: string) {
    super(`Recurso "${featureKey}" temporariamente desligado pela administração.`);
    this.name = "FeatureDisabledError";
  }
}

export async function requireFeature(
  admin: SupabaseClient,
  key: string,
  companyId: string | null = null,
): Promise<void> {
  const enabled = await isFeatureEnabled(admin, key, companyId);
  if (!enabled) throw new FeatureDisabledError(key);
}

/**
 * Converte FeatureDisabledError em Response 503 formatado.
 */
export function featureDisabledResponse(
  err: unknown,
  corsHeaders: Record<string, string>,
): Response | null {
  if (err instanceof FeatureDisabledError) {
    return new Response(
      JSON.stringify({
        error: err.message,
        code: err.code,
        feature: err.featureKey,
      }),
      {
        status: err.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
  return null;
}

/**
 * Invalida o cache interno. Use em testes ou webhooks que reagem a mudanças.
 */
export function clearFeatureFlagCache(): void {
  CACHE.clear();
}
