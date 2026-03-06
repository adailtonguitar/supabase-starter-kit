const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GEMINI_KEY = Deno.env.get("GOOGLE_GEMINI_KEY");
    if (!GEMINI_KEY) {
      console.error("[generate-marketing-art] GOOGLE_GEMINI_KEY not found");
      return new Response(
        JSON.stringify({ error: "GOOGLE_GEMINI_KEY não configurada. Configure no Supabase Dashboard > Edge Functions > Secrets." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const prompt = body.prompt || "";
    const width = body.width || 1080;
    const height = body.height || 1080;

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: "Prompt é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use Imagen model for image generation via Gemini API
    const imagenUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${GEMINI_KEY}`;

    const fullPrompt = `Professional social media promotional image, ${width}x${height} pixels. ${prompt}. High quality, vibrant colors, ready for social media posting.`;

    console.log("[generate-marketing-art] Calling Imagen API with prompt:", fullPrompt.substring(0, 100));

    const response = await fetch(imagenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt: fullPrompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: width > height ? "16:9" : width < height ? "9:16" : "1:1",
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[generate-marketing-art] Imagen error:", response.status, errText.substring(0, 300));

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fallback: try Gemini native image generation (Nano Banana)
      console.log("[generate-marketing-art] Imagen failed, trying Gemini native image generation...");
      return await tryGeminiNativeImage(GEMINI_KEY, fullPrompt);
    }

    const data = await response.json();
    console.log("[generate-marketing-art] Imagen response keys:", Object.keys(data));

    const predictions = data.predictions;
    if (predictions && predictions.length > 0 && predictions[0].bytesBase64Encoded) {
      const base64 = predictions[0].bytesBase64Encoded;
      const imageDataUrl = `data:image/png;base64,${base64}`;
      return new Response(
        JSON.stringify({ success: true, image: imageDataUrl }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.error("[generate-marketing-art] No predictions in Imagen response");
    // Fallback to Gemini native
    return await tryGeminiNativeImage(GEMINI_KEY, fullPrompt);
  } catch (err) {
    console.error("[generate-marketing-art] Fatal error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function tryGeminiNativeImage(apiKey: string, prompt: string): Promise<Response> {
  const models = ["gemini-2.0-flash-exp-image-generation", "gemini-2.0-flash"];

  for (const model of models) {
    try {
      console.log(`[generate-marketing-art] Trying Gemini native model: ${model}`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ["IMAGE", "TEXT"],
          },
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error(`[generate-marketing-art] ${model} error: ${resp.status} - ${errText.substring(0, 200)}`);
        continue;
      }

      const data = await resp.json();
      const parts = data.candidates?.[0]?.content?.parts;

      if (parts) {
        for (const part of parts) {
          if (part.inlineData?.data) {
            const mimeType = part.inlineData.mimeType || "image/png";
            const imageDataUrl = `data:${mimeType};base64,${part.inlineData.data}`;
            console.log(`[generate-marketing-art] Success with ${model}`);
            return new Response(
              JSON.stringify({ success: true, image: imageDataUrl }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }

      console.warn(`[generate-marketing-art] ${model} returned no image data`);
    } catch (err) {
      console.error(`[generate-marketing-art] ${model} exception:`, err);
    }
  }

  return new Response(
    JSON.stringify({ error: "Não foi possível gerar a imagem. Todos os modelos falharam. Tente novamente." }),
    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
