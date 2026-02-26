import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é um consultor financeiro especializado em pequenas e médias empresas brasileiras.
Seja claro, profissional e objetivo.
Destaque riscos.
Sugira melhorias práticas.
Não invente dados.
Estruture em tópicos:
1. Resumo Executivo
2. Pontos Positivos
3. Pontos de Atenção
4. Riscos
5. Recomendações
6. Tendência para próximo mês`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GEMINI_KEY = Deno.env.get("GOOGLE_GEMINI_KEY");
    if (!GEMINI_KEY) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_GEMINI_KEY não configurada." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Não autorizado." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getUser();
    if (claimsError || !claimsData?.user) {
      return new Response(
        JSON.stringify({ error: "Token inválido." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.user.id;
    const { mes_referencia } = await req.json();

    if (!mes_referencia) {
      return new Response(
        JSON.stringify({ error: "mes_referencia é obrigatório (formato: YYYY-MM)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch financial data
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: financeiro, error: fetchError } = await supabaseAdmin
      .from("financeiro_mensal")
      .select("receita, despesas, lucro, inadimplencia, clientes_ativos, percentual_maior_cliente")
      .eq("user_id", userId)
      .eq("mes_referencia", mes_referencia)
      .maybeSingle();

    if (fetchError) {
      console.error("[diagnostico-financeiro] Erro ao buscar dados:", fetchError.message);
      return new Response(
        JSON.stringify({ error: "Erro ao buscar dados financeiros." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!financeiro) {
      return new Response(
        JSON.stringify({ error: `Nenhum dado financeiro encontrado para ${mes_referencia}.` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build user prompt
    const userPrompt = `Analise os seguintes dados financeiros do mês ${mes_referencia}:
- Receita: R$ ${Number(financeiro.receita).toFixed(2)}
- Despesas: R$ ${Number(financeiro.despesas).toFixed(2)}
- Lucro: R$ ${Number(financeiro.lucro).toFixed(2)}
- Inadimplência: ${Number(financeiro.inadimplencia).toFixed(1)}%
- Clientes ativos: ${financeiro.clientes_ativos}
- Percentual do maior cliente: ${Number(financeiro.percentual_maior_cliente).toFixed(1)}%`;

    // Call Google Gemini API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;

    const aiResp = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: `${SYSTEM_PROMPT}\n\n${userPrompt}` }] },
        ],
        generationConfig: {
          maxOutputTokens: 600,
          temperature: 0.7,
        },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("[diagnostico-financeiro] Gemini error:", aiResp.status, errText.substring(0, 300));

      if (aiResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições do Gemini atingido. Tente em alguns minutos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: `Erro na API Gemini (${aiResp.status}).` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResp.json();
    const conteudo = aiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!conteudo) {
      return new Response(
        JSON.stringify({ error: "Resposta vazia da IA." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Save diagnosis
    const { error: insertError } = await supabaseAdmin
      .from("diagnosticos_financeiros")
      .insert({
        user_id: userId,
        mes_referencia,
        conteudo,
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error("[diagnostico-financeiro] Erro ao salvar:", insertError.message);
    }

    return new Response(
      JSON.stringify({
        diagnostico: conteudo,
        mes_referencia,
        salvo: !insertError,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[diagnostico-financeiro] Erro:", err?.message || err);
    return new Response(
      JSON.stringify({ error: "Erro interno na edge function." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
