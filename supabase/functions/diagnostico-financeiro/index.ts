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
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY não configurada. Configure no Supabase Dashboard > Edge Functions > Secrets." }),
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

    // Call OpenAI
    const openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 600,
        temperature: 0.7,
      }),
    });

    if (!openaiResp.ok) {
      const errText = await openaiResp.text();
      console.error("[diagnostico-financeiro] OpenAI error:", openaiResp.status, errText.substring(0, 300));
      return new Response(
        JSON.stringify({ error: `Erro na API OpenAI (${openaiResp.status}).` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await openaiResp.json();
    const conteudo = aiData?.choices?.[0]?.message?.content;

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
      // Return the diagnosis even if saving fails
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
