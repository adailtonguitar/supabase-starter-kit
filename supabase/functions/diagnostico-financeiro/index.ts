import { createClient } from "npm:@supabase/supabase-js@2";

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

const diagRateMap = new Map<string, { count: number; resetAt: number }>();

const SYSTEM_PROMPT = `Consultor financeiro de PMEs. Responda APENAS com a estrutura solicitada, sem nenhum texto antes ou depois.`;

async function callGemini(apiKey: string, systemPrompt: string, userPrompt: string): Promise<{ content: string | null; error: string | null; status: number }> {
  // Tentar modelos em ordem de preferência (limites maiores primeiro)
  const models = ["gemini-2.5-flash-lite", "gemini-2.0-flash-lite", "gemini-2.0-flash"];
  
  for (const model of models) {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    // console.log(`[diagnostico] Tentando modelo: ${model}...`);
    const startTime = Date.now();

    try {
      const resp = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] },
          ],
          generationConfig: { maxOutputTokens: 8192, temperature: 0.5 },
        }),
      });

      const elapsed = Date.now() - startTime;
      // console.log(`[diagnostico] ${model} respondeu em ${elapsed}ms — status: ${resp.status}`);

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

      // console.log(`[diagnostico] Sucesso com ${model}! (${content.length} chars)`);
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
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  // console.log("[diagnostico] ========== NOVA REQUISIÇÃO ==========");

  try {
    const GEMINI_KEY = Deno.env.get("GOOGLE_GEMINI_KEY");
    if (!GEMINI_KEY) {
      console.error("[diagnostico] GOOGLE_GEMINI_KEY não encontrada");
      return new Response(
        JSON.stringify({ error: "GOOGLE_GEMINI_KEY não configurada. Configure no Supabase Dashboard > Edge Functions > Secrets." }),
        { status: 503, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Não autorizado." }),
        { status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
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
        { status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.user.id;

    // Rate limiting: max 5 diagnostics per minute per user
    const rlKey = `diag:${userId}`;
    const now = Date.now();
    const rlEntry = diagRateMap.get(rlKey);
    if (rlEntry && now < rlEntry.resetAt && rlEntry.count >= 5) {
      return new Response(
        JSON.stringify({ error: "Limite de diagnósticos excedido. Aguarde 1 minuto." }),
        { status: 429, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }
    if (!rlEntry || now >= rlEntry.resetAt) {
      diagRateMap.set(rlKey, { count: 1, resetAt: now + 60_000 });
    } else {
      rlEntry.count++;
    }

    const { mes_referencia } = await req.json();

    if (!mes_referencia) {
      return new Response(
        JSON.stringify({ error: "mes_referencia é obrigatório (formato: YYYY-MM)." }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // console.log("[diagnostico] Buscando dados financeiros...");
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
        { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    if (!financeiro) {
      console.warn("[diagnostico] Nenhum dado encontrado para", mes_referencia);
      return new Response(
        JSON.stringify({ error: `Nenhum dado financeiro encontrado para ${mes_referencia}.` }),
        { status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // console.log("[diagnostico] Dados encontrados. Receita:", financeiro.receita, "Despesas:", financeiro.despesas);

    const userPrompt = `Dados financeiros de ${mes_referencia}:
- Receita: R$ ${Number(financeiro.receita).toFixed(2)}
- Despesas: R$ ${Number(financeiro.despesas).toFixed(2)}
- Lucro: R$ ${Number(financeiro.lucro).toFixed(2)}
- Inadimplência: ${Number(financeiro.inadimplencia).toFixed(1)}%
- Clientes ativos: ${financeiro.clientes_ativos}
- Maior cliente: ${Number(financeiro.percentual_maior_cliente).toFixed(1)}% da receita

Responda EXATAMENTE neste formato (sem saudação, sem introdução, sem "Prezado"):

## 1. Resumo Executivo
(máximo 3 frases)

## 2. Pontos Positivos
- (máximo 3 bullets de 1 frase cada)

## 3. Pontos de Atenção
- (máximo 2 bullets de 1 frase cada)

## 4. Riscos
- (máximo 3 bullets de 1 frase cada)

## 5. Recomendações
- (máximo 4 ações práticas de 1 frase cada)

## 6. Tendência próximo mês
(máximo 2 frases)

IMPORTANTE: Não ultrapasse 500 palavras no total.`;

    // Chamada única ao Gemini (sem retry para preservar quota)
    const result = await callGemini(GEMINI_KEY, SYSTEM_PROMPT, userPrompt);

    if (!result.content) {
      console.error("[diagnostico] Falha final:", result.error);
      return new Response(
        JSON.stringify({ error: result.error }),
        { status: result.status === 429 ? 429 : 502, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Salvar diagnóstico
    // console.log("[diagnostico] Salvando no banco...");
    const { error: insertError } = await supabaseAdmin
      .from("diagnosticos_financeiros")
      .insert({ user_id: userId, mes_referencia, conteudo: result.content, created_at: new Date().toISOString() });

    if (insertError) console.error("[diagnostico] Erro ao salvar:", insertError.message);
    else // console.log("[diagnostico] Salvo com sucesso!");

    // console.log("[diagnostico] ========== REQUISIÇÃO CONCLUÍDA ==========");

    return new Response(
      JSON.stringify({ diagnostico: result.content, mes_referencia, salvo: !insertError }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[diagnostico] Erro fatal:", err?.message || err);
    return new Response(
      JSON.stringify({ error: "Erro interno na edge function." }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
