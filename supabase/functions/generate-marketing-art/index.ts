import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Models that support responseModalities: ["IMAGE", "TEXT"]
const IMAGE_MODELS = [
  "gemini-2.0-flash-exp-image-generation",
  "gemini-2.5-flash-preview-04-17",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── JWT Authentication ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonRes({ error: "Não autorizado" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return jsonRes({ error: "Token inválido" }, 401);
    }

    const GEMINI_KEY = Deno.env.get("GOOGLE_GEMINI_KEY");
    if (!GEMINI_KEY) {
      return jsonRes({ error: "GOOGLE_GEMINI_KEY não configurada" }, 500);
    }

    const body = await req.json();
    const prompt = body.prompt || "";
    if (!prompt) return jsonRes({ error: "Prompt é obrigatório" }, 400);

    const width = body.width || 1080;
    const height = body.height || 1080;
    const fullPrompt = `Create a ${width}x${height} professional social media promotional image. ${prompt}. High quality, vibrant colors, modern design.`;

    const errors: string[] = [];

    for (const model of IMAGE_MODELS) {
      // Try up to 2 times per model with delay for rate limits
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          if (attempt > 0) {
            console.log(`[marketing-art] Retry ${model} after delay...`);
            await new Promise(r => setTimeout(r, 3000));
          }

          console.log(`[marketing-art] Trying ${model} (attempt ${attempt}) for user ${user.id}...`);
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

          const resp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: fullPrompt }] }],
              generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
            }),
          });

          if (resp.status === 429) {
            const errText = await resp.text();
            console.warn(`[marketing-art] ${model}: 429 rate limited`);
            errors.push(`${model}: quota excedida`);
            continue; // retry
          }

          if (!resp.ok) {
            const errText = await resp.text();
            console.warn(`[marketing-art] ${model}: ${resp.status}`);
            errors.push(`${model}: ${resp.status} - ${errText.substring(0, 100)}`);
            break; // don't retry non-429 errors
          }

          const data = await resp.json();
          const parts = data.candidates?.[0]?.content?.parts;

          if (parts) {
            for (const part of parts) {
              if (part.inlineData?.data) {
                const mime = part.inlineData.mimeType || "image/png";
                console.log(`[marketing-art] Success with ${model}!`);
                return jsonRes({
                  success: true,
                  image: `data:${mime};base64,${part.inlineData.data}`,
                });
              }
            }
          }

          errors.push(`${model}: resposta sem imagem`);
          break;
        } catch (e) {
          errors.push(`${model}: ${String(e)}`);
          break;
        }
      }
    }

    // All models failed
    const isQuotaError = errors.every(e => e.includes("quota") || e.includes("429"));
    const userMessage = isQuotaError
      ? "Limite de uso da API Gemini atingido. Aguarde 1-2 minutos e tente novamente."
      : "Não foi possível gerar a imagem. " + errors.join(" | ");

    return jsonRes({ error: userMessage }, isQuotaError ? 429 : 500);
  } catch (err) {
    console.error("[marketing-art] Fatal:", err);
    return jsonRes({ error: String(err) }, 500);
  }
});

function jsonRes(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
