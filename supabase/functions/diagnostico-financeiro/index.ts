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

async function callGemini(apiKey: string, systemPrompt: string, userPrompt: string): Promise<{ content: string | null; error: string | null; status: number }> {
  // Tentar modelos em ordem de preferência (limites maiores primeiro)
  const models = ["gemini-2.5-flash-lite", "gemini-2.0-flash-lite", "gemini-2.0-flash"];
  
  for (const model of models) {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    console.log(`[diagnostico] Tentando modelo: ${model}...`);
    const startTime = Date.now();

    try {
      const resp = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] },
          ],
          generationConfig: { maxOutputTokens: 600, temperature: 0.7 },
        }),
      });

      const elapsed = Date.now() - startTime;
      console.log(`[diagnostico] ${model} respondeu em ${elapsed}ms — status: ${resp.status}`);

      if (resp.status === 429) {
        const errText = await resp.text();
        console.warn(`[diagnostico] Rate limit no ${model}: ${errText.substring(0, 200)}`);
        continue; // tenta próximo modelo
      }

      if (resp.status === 404) {
        console.warn(`[diagnostico] Modelo ${model} não encontrado, tentando próximo...`);
        continue;
      }

      if (resp.status === 403) {
        const errText = await resp.text();
        console.error(`[diagnostico] Acesso negado (403): ${errText.substring(0, 200)}`);
        return { content: null, error: `Chave sem permissão (403): ${errText.substring(0, 100)}`, status: 403 };
      }

      if (!resp.ok) {
        const errText = await resp.text();
        console.error(`[diagnostico] Erro ${resp.status} no ${model}: ${errText.substring(0, 300)}`);
        return { content: null, error: `Erro Gemini ${model} (${resp.status}): ${errText.substring(0, 150)}`, status: resp.status };
      }

      const data = await resp.json();
      const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!content) {
        console.error(`[diagnostico] ${model} sem conteúdo:`, JSON.stringify(data).substring(0, 300));
        return { content: null, error: `Resposta vazia do ${model}.`, status: 200 };
      }

      console.log(`[diagnostico] Sucesso com ${model}! (${content.length} chars)`);
      return { content, error: null, status: 200 };
    } catch (err: any) {
      console.error(`[diagnostico] Erro de rede no ${model}:`, err?.message);
      continue; // tenta próximo modelo
    }
  }

  return { content: null, error: "Todos os modelos Gemini falharam (rate limit). Aguarde 1-2 minutos.", status: 429 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("[diagnostico] ========== NOVA REQUISIÇÃO ==========");

  try {
    const GEMINI_KEY = Deno.env.get("GOOGLE_GEMINI_KEY");
    if (!GEMINI_KEY) {
      console.error("[diagnostico] GOOGLE_GEMINI_KEY não encontrada");
      return new Response(
        JSON.stringify({ error: "GOOGLE_GEMINI_KEY não configurada. Configure no Supabase Dashboard > Edge Functions > Secrets." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
    console.log("[diagnostico] Usuário autenticado:", userId);

    const { mes_referencia } = await req.json();
    console.log("[diagnostico] Mês solicitado:", mes_referencia);

    if (!mes_referencia) {
      return new Response(
        JSON.stringify({ error: "mes_referencia é obrigatório (formato: YYYY-MM)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    console.log("[diagnostico] Buscando dados financeiros...");
    const { data: financeiro, error: fetchError } = await supabaseAdmin
      .from("financeiro_mensal")
      .select("receita, despesas, lucro, inadimplencia, clientes_ativos, percentual_maior_cliente")
      .eq("user_id", userId)
      .eq("mes_referencia", mes_referencia)
      .maybeSingle();

    if (fetchError) {
      console.error("[diagnostico] Erro no banco:", fetchError.message);
      return new Response(
        JSON.stringify({ error: "Erro ao buscar dados financeiros." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!financeiro) {
      console.warn("[diagnostico] Nenhum dado encontrado para", mes_referencia);
      return new Response(
        JSON.stringify({ error: `Nenhum dado financeiro encontrado para ${mes_referencia}.` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[diagnostico] Dados encontrados. Receita:", financeiro.receita, "Despesas:", financeiro.despesas);

    const userPrompt = `Analise os seguintes dados financeiros do mês ${mes_referencia}:
- Receita: R$ ${Number(financeiro.receita).toFixed(2)}
- Despesas: R$ ${Number(financeiro.despesas).toFixed(2)}
- Lucro: R$ ${Number(financeiro.lucro).toFixed(2)}
- Inadimplência: ${Number(financeiro.inadimplencia).toFixed(1)}%
- Clientes ativos: ${financeiro.clientes_ativos}
- Percentual do maior cliente: ${Number(financeiro.percentual_maior_cliente).toFixed(1)}%`;

    // Chamada única ao Gemini (sem retry para preservar quota)
    const result = await callGemini(GEMINI_KEY, SYSTEM_PROMPT, userPrompt);

    if (!result.content) {
      console.error("[diagnostico] Falha final:", result.error);
      return new Response(
        JSON.stringify({ error: result.error }),
        { status: result.status === 429 ? 429 : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Salvar diagnóstico
    console.log("[diagnostico] Salvando no banco...");
    const { error: insertError } = await supabaseAdmin
      .from("diagnosticos_financeiros")
      .insert({ user_id: userId, mes_referencia, conteudo: result.content, created_at: new Date().toISOString() });

    if (insertError) console.error("[diagnostico] Erro ao salvar:", insertError.message);
    else console.log("[diagnostico] Salvo com sucesso!");

    console.log("[diagnostico] ========== REQUISIÇÃO CONCLUÍDA ==========");

    return new Response(
      JSON.stringify({ diagnostico: result.content, mes_referencia, salvo: !insertError }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[diagnostico] Erro fatal:", err?.message || err);
    return new Response(
      JSON.stringify({ error: "Erro interno na edge function." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
