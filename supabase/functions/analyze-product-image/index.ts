import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { image_base64, company_id } = await req.json();

    if (!image_base64) {
      return new Response(JSON.stringify({ error: "image_base64 required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GEMINI_KEY = Deno.env.get("GOOGLE_GEMINI_KEY");
    if (!GEMINI_KEY) {
      return new Response(JSON.stringify({ error: "GOOGLE_GEMINI_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;

    const resp = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: systemPrompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: imageData,
                },
              },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: 500,
          temperature: 0.2,
        },
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[analyze-product-image] Gemini error:", resp.status, errText.substring(0, 300));
      return new Response(JSON.stringify({ error: "Erro na análise de IA", details: resp.status }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      console.error("[analyze-product-image] No content from Gemini");
      return new Response(JSON.stringify({ error: "IA não retornou resultado" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[analyze-product-image] Success:", parsed.name, "confidence:", parsed.confidence);

    return new Response(JSON.stringify({ success: true, product: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[analyze-product-image] Error:", err?.message);
    return new Response(JSON.stringify({ error: err?.message || "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
