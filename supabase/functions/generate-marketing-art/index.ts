const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const errors: string[] = [];

  try {
    const GEMINI_KEY = Deno.env.get("GOOGLE_GEMINI_KEY");
    if (!GEMINI_KEY) {
      return jsonResponse({ error: "GOOGLE_GEMINI_KEY não configurada" }, 500);
    }

    const body = await req.json();
    const prompt = body.prompt || "";
    const width = body.width || 1080;
    const height = body.height || 1080;

    if (!prompt) {
      return jsonResponse({ error: "Prompt é obrigatório" }, 400);
    }

    const fullPrompt = `Professional social media promotional image, ${width}x${height} pixels. ${prompt}. High quality, vibrant colors, ready for social media posting.`;

    // Strategy 1: Try Imagen models
    const imagenModels = ["imagen-3.0-generate-002", "imagen-3.0-fast-generate-001"];
    for (const model of imagenModels) {
      try {
        console.log(`[marketing-art] Trying ${model}...`);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${GEMINI_KEY}`;
        const aspectRatio = width > height ? "16:9" : width < height ? "9:16" : "1:1";

        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instances: [{ prompt: fullPrompt }],
            parameters: { sampleCount: 1, aspectRatio },
          }),
        });

        if (resp.ok) {
          const data = await resp.json();
          const b64 = data.predictions?.[0]?.bytesBase64Encoded;
          if (b64) {
            console.log(`[marketing-art] Success with ${model}`);
            return jsonResponse({ success: true, image: `data:image/png;base64,${b64}` });
          }
        }
        const errText = await resp.text();
        const msg = `${model}: ${resp.status} - ${errText.substring(0, 150)}`;
        console.warn(`[marketing-art] ${msg}`);
        errors.push(msg);
      } catch (e) {
        errors.push(`${model}: ${String(e)}`);
      }
    }

    // Strategy 2: Gemini native image generation (responseModalities: IMAGE)
    const geminiModels = ["gemini-2.0-flash-exp-image-generation", "gemini-2.0-flash"];
    for (const model of geminiModels) {
      try {
        console.log(`[marketing-art] Trying Gemini native: ${model}...`);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: fullPrompt }] }],
            generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
          }),
        });

        if (resp.ok) {
          const data = await resp.json();
          const parts = data.candidates?.[0]?.content?.parts;
          if (parts) {
            for (const part of parts) {
              if (part.inlineData?.data) {
                const mime = part.inlineData.mimeType || "image/png";
                console.log(`[marketing-art] Success with ${model}`);
                return jsonResponse({ success: true, image: `data:${mime};base64,${part.inlineData.data}` });
              }
            }
          }
          errors.push(`${model}: response ok but no image data`);
        } else {
          const errText = await resp.text();
          const msg = `${model}: ${resp.status} - ${errText.substring(0, 150)}`;
          console.warn(`[marketing-art] ${msg}`);
          errors.push(msg);
        }
      } catch (e) {
        errors.push(`${model}: ${String(e)}`);
      }
    }

    console.error("[marketing-art] All models failed:", errors);
    return jsonResponse({
      error: "Não foi possível gerar a imagem. Detalhes: " + errors.join(" | "),
    }, 500);
  } catch (err) {
    console.error("[marketing-art] Fatal:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
