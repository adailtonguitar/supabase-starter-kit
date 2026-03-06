import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MODELS = [
  "gemini-2.5-flash-preview-05-20",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { prompt, width, height } = await req.json();

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: "Prompt é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fullPrompt = `Generate a ${width || 1080}x${height || 1080} professional social media promotional image. ${prompt}. The image should be high quality, vibrant, and ready for social media posting.`;

    let lastError = "";

    for (const model of MODELS) {
      try {
        console.log(`[generate-marketing-art] Trying model: ${model}`);
        
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: [{ text: fullPrompt }],
                },
              ],
              generationConfig: {
                responseModalities: ["TEXT", "IMAGE"],
              },
            }),
          }
        );

        if (!response.ok) {
          const errText = await response.text();
          console.error(`[generate-marketing-art] ${model} error ${response.status}: ${errText}`);
          lastError = `${model}: ${response.status}`;
          continue;
        }

        const data = await response.json();
        const parts = data.candidates?.[0]?.content?.parts;

        if (!parts) {
          lastError = `${model}: sem partes na resposta`;
          continue;
        }

        // Find image part
        const imagePart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith("image/"));

        if (imagePart) {
          const base64 = imagePart.inlineData.data;
          const mimeType = imagePart.inlineData.mimeType;
          return new Response(
            JSON.stringify({
              success: true,
              image: `data:${mimeType};base64,${base64}`,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // No image returned, try text response
        const textPart = parts.find((p: any) => p.text);
        lastError = `${model}: modelo não retornou imagem (${textPart?.text?.substring(0, 100) || "sem texto"})`;
        continue;
      } catch (err) {
        console.error(`[generate-marketing-art] ${model} exception:`, err);
        lastError = `${model}: ${err.message}`;
        continue;
      }
    }

    return new Response(
      JSON.stringify({ error: `Nenhum modelo conseguiu gerar a imagem. Último erro: ${lastError}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[generate-marketing-art] Fatal error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
