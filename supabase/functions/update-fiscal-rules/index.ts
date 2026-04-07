/**
 * Edge Function: update-fiscal-rules
 * 
 * Job diário para atualizar a base fiscal:
 * 1. Busca dados IBPT mais recentes
 * 2. Atualiza tabela fiscal_ncm_rules no banco
 * 3. Loga resultado da atualização
 * 
 * Executado via pg_cron 1x por dia às 03:00
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const IBPT_API = "https://ibpt.valraw.com.br/api";

// UFs prioritárias (expandir conforme necessidade)
const PRIORITY_UFS = ["MA", "SP", "RJ", "MG", "PR", "SC", "RS", "BA", "CE", "PE", "GO", "DF"];

interface IBPTItem {
  codigo: string;
  descricao: string;
  aliquotaNacionalFederal: number;
  aliquotaImportadosFederal: number;
  aliquotaEstadual: number;
  aliquotaMunicipal: number;
  vigenciaInicio?: string;
  vigenciaFim?: string;
}

// ─── NCMs conhecidos como monofásicos ───
const MONOFASICO_PREFIXES = new Set([
  "2201", "2202", "2203", "2207", "2208",
  "2710", "2711",
  "3003", "3004",
  "3303", "3304", "3305", "3401",
  "4011", "8702", "8703", "8704", "8714",
]);

// ─── NCMs com ST obrigatória (susceptíveis) ───
const ST_PREFIXES = new Set([
  "2201", "2202", "2203", "2204", "2205", "2206", "2207", "2208",
  "2402", "2710", "2711",
  "3208", "3209", "3210", "3303", "3304", "3305", "3306", "3307", "3401",
  "4011", "2523", "7213", "7214", "8536",
  "3917", "3921", "3925",
  "8702", "8703", "8704",
]);

// ─── NCMs que exigem CEST ───
const CEST_PREFIXES = new Set([
  "2201", "2202", "2203", "2204", "2205", "2206", "2207", "2208",
  "2402", "2710", "2711",
  "3208", "3209", "3210", "4011", "2523", "7213", "7214", "8536",
  "3917", "3921", "3925",
]);

function matchesAnyPrefix(ncm: string, prefixes: Set<string>): boolean {
  for (const p of prefixes) {
    if (ncm.startsWith(p)) return true;
  }
  return false;
}

function categorizeNCM(ncm: string): string {
  const categories: Record<string, string> = {
    "01": "Animais vivos", "02": "Carnes", "03": "Peixes", "04": "Laticínios",
    "07": "Hortícolas", "08": "Frutas", "09": "Café e chá", "10": "Cereais",
    "11": "Farinhas", "15": "Gorduras", "16": "Preparações alimentícias",
    "17": "Açúcares", "18": "Cacau", "19": "Preparações de cereais",
    "20": "Preparações de legumes", "21": "Preparações alimentícias diversas",
    "22": "Bebidas", "24": "Tabaco", "25": "Minerais", "27": "Combustíveis",
    "30": "Farmacêuticos", "33": "Cosméticos", "34": "Sabões", "39": "Plásticos",
    "40": "Borrachas", "48": "Papel", "61": "Vestuário malha", "62": "Vestuário tecido",
    "64": "Calçados", "68": "Obras de pedra", "69": "Cerâmica",
    "70": "Vidros", "72": "Ferro e aço", "73": "Obras de ferro/aço",
    "76": "Alumínio", "84": "Máquinas", "85": "Material elétrico",
    "87": "Veículos", "90": "Instrumentos ópticos", "94": "Móveis",
  };
  const cap2 = ncm.substring(0, 2);
  return categories[cap2] || "Outros";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Missing env" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const startTime = Date.now();
  const logs: string[] = [];
  let totalUpdated = 0;
  let totalErrors = 0;

  try {
    // 1. Descobrir versão mais recente do IBPT
    const ano = new Date().getFullYear();
    const metaResp = await fetch(`${IBPT_API}/${ano}/index.json`);
    if (!metaResp.ok) {
      logs.push(`Erro ao buscar índice IBPT: HTTP ${metaResp.status}`);
      return respond({ success: false, logs, totalUpdated, totalErrors });
    }

    const metaData = await metaResp.json();
    const versoes = (metaData?.versoes || []).filter((v: any) => v.registros > 0);
    if (versoes.length === 0) {
      logs.push("Nenhuma versão IBPT com registros encontrada");
      return respond({ success: false, logs, totalUpdated, totalErrors });
    }

    const latestVersion = versoes[versoes.length - 1].tabela;
    logs.push(`Versão IBPT: ${latestVersion} (${ano})`);

    // 2. Processar cada UF prioritária
    for (const uf of PRIORITY_UFS) {
      try {
        const ufResp = await fetch(`${IBPT_API}/${ano}/${latestVersion}/ncm/${uf}.json.gz`, {
          headers: { "Accept-Encoding": "gzip" },
        });

        if (!ufResp.ok) {
          logs.push(`[${uf}] Erro HTTP ${ufResp.status}`);
          totalErrors++;
          continue;
        }

        const ufJson = await ufResp.json();
        const dados: IBPTItem[] = ufJson?.dados || [];
        logs.push(`[${uf}] ${dados.length} NCMs recebidos`);

        // 3. Upsert em lotes
        const BATCH_SIZE = 200;
        for (let i = 0; i < dados.length; i += BATCH_SIZE) {
          const batch = dados.slice(i, i + BATCH_SIZE).map(item => ({
            ncm: item.codigo,
            descricao: item.descricao || "",
            uf,
            categoria: categorizeNCM(item.codigo),
            monofasico: matchesAnyPrefix(item.codigo, MONOFASICO_PREFIXES),
            st_susceptivel: matchesAnyPrefix(item.codigo, ST_PREFIXES),
            cest_obrigatorio: matchesAnyPrefix(item.codigo, CEST_PREFIXES),
            aliq_nacional: item.aliquotaNacionalFederal || 0,
            aliq_importado: item.aliquotaImportadosFederal || 0,
            aliq_estadual: item.aliquotaEstadual || 0,
            aliq_municipal: item.aliquotaMunicipal || 0,
            fonte: "IBPT",
            versao_ibpt: latestVersion,
            vigencia_inicio: item.vigenciaInicio || null,
            vigencia_fim: item.vigenciaFim || null,
            atualizado_em: new Date().toISOString(),
          }));

          const { error } = await supabase
            .from("fiscal_ncm_rules")
            .upsert(batch, { onConflict: "ncm,uf" });

          if (error) {
            logs.push(`[${uf}] Erro batch ${i}: ${error.message}`);
            totalErrors++;
          } else {
            totalUpdated += batch.length;
          }
        }
      } catch (err: any) {
        logs.push(`[${uf}] Exceção: ${err.message}`);
        totalErrors++;
      }
    }

    const elapsed = Date.now() - startTime;
    logs.push(`Concluído em ${elapsed}ms — ${totalUpdated} registros, ${totalErrors} erros`);

    // 4. Log de auditoria
    await supabase.from("action_logs").insert({
      action: "fiscal_rules_update",
      module: "fiscal",
      details: JSON.stringify({
        versao: latestVersion,
        ufs: PRIORITY_UFS,
        totalUpdated,
        totalErrors,
        elapsed,
      }),
    });

    return respond({ success: totalErrors === 0, logs, totalUpdated, totalErrors });
  } catch (err: any) {
    logs.push(`Erro fatal: ${err.message}`);
    return respond({ success: false, logs, totalUpdated, totalErrors: totalErrors + 1 });
  }
});

function respond(data: any) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
