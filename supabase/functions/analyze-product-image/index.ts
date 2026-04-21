import { createClient } from "npm:@supabase/supabase-js@2";
import { isFeatureEnabled } from "../_shared/feature-flags.ts";
import { checkAiQuota, logAiUsage } from "../_shared/ai-usage.ts";

const ALLOWED_ORIGINS = [
  "https://anthosystemcombr.lovable.app",
  "https://anthosystem.com.br",
  "https://www.anthosystem.com.br",
  "https://id-preview--d4ab3861-f98c-4c08-a556-30aa884845a3.lovable.app",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

async function callGeminiVision(apiKey: string, contents: any[]): Promise<{ data: any | null; error: string | null; status: number; model: string | null }> {
  const models = ["gemini-2.5-flash-lite", "gemini-2.0-flash-lite", "gemini-2.0-flash", "gemini-1.5-flash"];
  
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    console.log(`[analyze-product-image] Tentando modelo: ${model}...`);
    
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          generationConfig: { maxOutputTokens: 500, temperature: 0.2 },
        }),
      });

      console.log(`[analyze-product-image] ${model} status: ${resp.status}`);

      if (resp.status === 429 || resp.status === 404 || resp.status === 503) {
        const errText = await resp.text();
        console.warn(`[analyze-product-image] ${model} falhou (${resp.status}): ${errText.substring(0, 150)}`);
        continue;
      }

      if (!resp.ok) {
        const errText = await resp.text();
        console.error(`[analyze-product-image] ${model} erro: ${errText.substring(0, 300)}`);
        continue;
      }

      const data = await resp.json();
      console.log(`[analyze-product-image] Sucesso com ${model}!`);
      return { data, error: null, status: 200, model };
    } catch (err: any) {
      console.error(`[analyze-product-image] Erro de rede no ${model}:`, err?.message);
      continue;
    }
  }

  return { data: null, error: "Todos os modelos falharam. Aguarde 1-2 minutos.", status: 429, model: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    // JWT validation
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { image_base64, company_id } = await req.json();

    if (!image_base64) {
      return new Response(JSON.stringify({ error: "image_base64 required" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ── Kill switch (feature flag) ──
    const supabaseUrlFlag = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKeyFlag = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sbAdminFlag = createClient(supabaseUrlFlag, serviceRoleKeyFlag);
    const flagEnabled = await isFeatureEnabled(sbAdminFlag, "ai_product_image", company_id ?? null);
    if (!flagEnabled) {
      return new Response(
        JSON.stringify({
          error: "Análise de imagem com IA temporariamente indisponível.",
          code: "FEATURE_DISABLED",
          feature: "ai_product_image",
        }),
        { status: 503, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // Rate limiting: max 10 analyses per minute per company
    if (company_id) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sbAdmin = createClient(supabaseUrl, serviceRoleKey);
      const { data: allowed } = await sbAdmin.rpc("check_rate_limit", {
        p_company_id: company_id,
        p_fn_name: "analyze-product-image",
        p_max_calls: 10,
        p_window_sec: 60,
      });
      if (allowed === false) {
        return new Response(JSON.stringify({ error: "Limite de análises excedido. Aguarde 1 minuto." }), {
          status: 429, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      // Quota mensal por plano
      const quota = await checkAiQuota(sbAdmin, company_id, "ai_product_image");
      if (!quota.allowed) {
        return new Response(
          JSON.stringify({
            error: quota.reason ?? "Limite de análises por IA do seu plano atingido.",
            code: "QUOTA_EXCEEDED",
            feature: "ai_product_image",
            plan: quota.plan,
            used: quota.used,
            limit: quota.limit,
          }),
          { status: 429, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
        );
      }
    }

    const GEMINI_KEY = Deno.env.get("GOOGLE_GEMINI_KEY");
    if (!GEMINI_KEY) {
      return new Response(JSON.stringify({ error: "GOOGLE_GEMINI_KEY not configured" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Fetch existing categories from the company for better suggestions
    let existingCategories: string[] = [];
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, serviceRoleKey);
      
      const { data: products } = await supabase
        .from("products")
        .select("category")
        .eq("company_id", company_id)
        .not("category", "is", null);
      
      if (products) {
        existingCategories = [...new Set(products.map((p: any) => p.category).filter(Boolean))];
      }
    } catch {}

    const categoriesHint = existingCategories.length > 0
      ? `Categorias já usadas na loja: ${existingCategories.join(", ")}.`
      : "";

    const systemPrompt = `Você é um especialista em varejo brasileiro. Analise a foto de um produto e extraia as informações para cadastro.

Responda EXCLUSIVAMENTE em JSON válido, sem markdown, sem \`\`\`, apenas o objeto JSON puro.

Formato exato da resposta:
{
  "name": "Nome completo do produto (marca + descrição + peso/volume se visível)",
  "category": "Categoria mais adequada",
  "unit": "UN ou KG ou LT ou MT ou CX ou PCT",
  "ncm": "Código NCM de 8 dígitos se conseguir identificar, senão string vazia",
  "barcode": "Código de barras se visível na imagem, senão string vazia",
  "price_suggestion": 0,
  "confidence": 0.0
}

Regras:
- "confidence" de 0.0 a 1.0 indicando certeza da identificação
- Se não conseguir identificar o produto, retorne confidence 0 e name "Produto não identificado"
- "price_suggestion" é uma estimativa do preço de venda típico em reais (0 se não souber)
- Unidades válidas: UN (unidade), KG (quilo), LT (litro), MT (metro), CX (caixa), PCT (pacote)
- Para NCM, use apenas se tiver certeza. Exemplos comuns: cerveja=2203.00.00, refrigerante=2202.10.00, arroz=1006.30.21
${categoriesHint}
- Prefira categorias existentes quando o produto se encaixar nelas`;

    // Remove data URL prefix if present
    let imageData = image_base64;
    if (imageData.includes(",")) {
      imageData = imageData.split(",")[1];
    }

    // Detect MIME type
    let mimeType = "image/jpeg";
    if (image_base64.startsWith("data:image/png")) mimeType = "image/png";
    else if (image_base64.startsWith("data:image/webp")) mimeType = "image/webp";

    const contents = [
      {
        role: "user",
        parts: [
          { text: systemPrompt },
          { inline_data: { mime_type: mimeType, data: imageData } },
        ],
      },
    ];

    const startedAt = Date.now();
    const result = await callGeminiVision(GEMINI_KEY, contents);
    const latencyMs = Date.now() - startedAt;

    // Log de uso (sucesso ou falha) — sempre async, nunca bloqueante
    const sbAdminLog = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const usage = result.data?.usageMetadata ?? {};
    logAiUsage(sbAdminLog, {
      companyId: company_id ?? null,
      userId: (claimsData.claims.sub as string | undefined) ?? null,
      functionName: "ai_product_image",
      provider: "google",
      model: result.model ?? undefined,
      tokensPrompt: Number(usage.promptTokenCount ?? 0),
      tokensCompletion: Number(usage.candidatesTokenCount ?? 0),
      success: Boolean(result.data),
      errorCode: result.data ? undefined : (result.error ?? "unknown").slice(0, 120),
      latencyMs,
    }).catch(() => { /* fail-open */ });

    if (!result.data) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: result.status === 429 ? 429 : 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const rawText = result.data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      console.error("[analyze-product-image] No content from Gemini");
      return new Response(JSON.stringify({ error: "IA não retornou resultado" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Parse JSON from response (handle possible markdown wrapping)
    let parsed;
    try {
      let jsonStr = rawText.trim();
      // Remove markdown code block if present
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error("[analyze-product-image] JSON parse error:", rawText.substring(0, 300));
      return new Response(JSON.stringify({ error: "Erro ao interpretar resposta da IA", raw: rawText.substring(0, 200) }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    console.log("[analyze-product-image] Success:", parsed.name, "confidence:", parsed.confidence);

    return new Response(JSON.stringify({ success: true, product: parsed }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[analyze-product-image] Error:", err?.message);
    return new Response(JSON.stringify({ error: err?.message || "Erro interno" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
