/**
 * _shared/ai-usage.ts
 *
 * Helpers para:
 *   1. Checar quota mensal antes de chamar IA (checkAiQuota).
 *   2. Registrar uso depois da chamada (logAiUsage).
 *
 * Sempre fail-open: erros de log nunca devem derrubar a função principal.
 *
 * Pricing aproximado (para calcular custo em milésimos de centavo de USD):
 *   1 USD = 100.000 millicents
 *   1¢    = 1.000 millicents
 *   0.001¢ = 1 millicent
 *
 * Ajuste a tabela MODEL_PRICING conforme a realidade atual da sua conta.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2?dts";

export interface AiQuotaResult {
  allowed: boolean;
  used: number;
  limit: number | null;
  plan: string;
  reason: string | null;
}

export async function checkAiQuota(
  admin: SupabaseClient,
  companyId: string,
  functionKey: string,
): Promise<AiQuotaResult> {
  try {
    const { data, error } = await admin.rpc("check_ai_quota", {
      p_company_id: companyId,
      p_function_name: functionKey,
    });
    if (error) {
      console.warn(`[ai-usage] check_ai_quota erro:`, error.message);
      return { allowed: true, used: 0, limit: null, plan: "unknown", reason: null };
    }
    return data as AiQuotaResult;
  } catch (err) {
    console.warn(`[ai-usage] check_ai_quota exceção:`, err);
    return { allowed: true, used: 0, limit: null, plan: "unknown", reason: null };
  }
}

export interface LogUsageParams {
  companyId: string | null;
  userId: string | null;
  functionName: string;
  provider?: string;
  model?: string;
  tokensPrompt?: number;
  tokensCompletion?: number;
  success?: boolean;
  errorCode?: string;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Tabela simplificada de pricing. Valores em millicents por 1K tokens.
 * Fonte: preços públicos dos provedores (subject a change).
 */
const MODEL_PRICING: Record<string, { promptPer1k: number; completionPer1k: number }> = {
  // Google Gemini (aprox.)
  "gemini-2.5-flash":         { promptPer1k: 10,  completionPer1k: 40  }, // 0.01¢ / 0.04¢
  "gemini-2.5-flash-lite":    { promptPer1k: 3,   completionPer1k: 10  },
  "gemini-2.0-flash":         { promptPer1k: 10,  completionPer1k: 40  },
  "gemini-2.0-flash-lite":    { promptPer1k: 3,   completionPer1k: 10  },
  "gemini-1.5-flash":         { promptPer1k: 7,   completionPer1k: 30  },
  "gemini-1.5-pro":           { promptPer1k: 125, completionPer1k: 500 },
  // OpenAI (aprox.)
  "gpt-4o-mini":              { promptPer1k: 15,  completionPer1k: 60  },
  "gpt-4o":                   { promptPer1k: 250, completionPer1k: 1000 },
  "gpt-3.5-turbo":            { promptPer1k: 50,  completionPer1k: 150 },
};

function computeCostMillicents(
  model: string | undefined,
  tokensPrompt: number,
  tokensCompletion: number,
): number {
  if (!model) return 0;
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  return Math.round(
    (tokensPrompt / 1000) * pricing.promptPer1k +
      (tokensCompletion / 1000) * pricing.completionPer1k,
  );
}

export async function logAiUsage(
  admin: SupabaseClient,
  params: LogUsageParams,
): Promise<void> {
  try {
    const cost = computeCostMillicents(
      params.model,
      params.tokensPrompt ?? 0,
      params.tokensCompletion ?? 0,
    );
    const { error } = await admin.rpc("log_ai_usage", {
      p_company_id: params.companyId,
      p_user_id: params.userId,
      p_function_name: params.functionName,
      p_provider: params.provider ?? "unknown",
      p_model: params.model ?? null,
      p_tokens_prompt: params.tokensPrompt ?? 0,
      p_tokens_completion: params.tokensCompletion ?? 0,
      p_cost_millicents: cost,
      p_success: params.success ?? true,
      p_error_code: params.errorCode ?? null,
      p_latency_ms: params.latencyMs ?? null,
      p_metadata: params.metadata ?? {},
    });
    if (error) {
      console.warn(`[ai-usage] log_ai_usage erro:`, error.message);
    }
  } catch (err) {
    console.warn(`[ai-usage] log_ai_usage exceção:`, err);
  }
}

/**
 * Heurística simples de contagem de tokens quando o provedor não retorna.
 * 1 token ≈ 4 caracteres em inglês / 3 em português.
 */
export function estimateTokensFromText(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.5);
}
