import { createClient } from "npm:@supabase/supabase-js@2";
import { nuvemFiscalRequest } from "../_shared/nuvem-fiscal-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const results: Record<string, unknown> = {};

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Check sandbox mode
    const sandbox = Deno.env.get("NUVEM_FISCAL_SANDBOX");
    results.nuvem_fiscal_sandbox = sandbox;
    results.ambiente = sandbox === "true" ? "SANDBOX (não verá notas reais!)" : "PRODUÇÃO";

    // 2. Check credentials
    const hasClientId = !!Deno.env.get("NUVEM_FISCAL_CLIENT_ID");
    const hasClientSecret = !!Deno.env.get("NUVEM_FISCAL_CLIENT_SECRET");
    results.credentials = { hasClientId, hasClientSecret };

    // 3. Get companies
    const { data: companies, error: compErr } = await supabaseAdmin
      .from("companies")
      .select("id, name, cnpj, ie")
      .not("cnpj", "is", null)
      .eq("is_demo", false);

    if (compErr) {
      results.companies_error = compErr.message;
      return respond(results);
    }

    results.companies_found = (companies || []).length;
    results.companies = (companies || []).map((c: any) => ({
      name: c.name,
      cnpj: (c.cnpj || "").replace(/\D/g, ""),
      ie: c.ie,
    }));

    // 4. For each company, check sync control and try distribution
    const companyDiags: any[] = [];

    for (const company of (companies || []).slice(0, 3)) {
      const cnpj = (company.cnpj || "").replace(/\D/g, "");
      if (cnpj.length !== 14) continue;

      const diag: Record<string, unknown> = { name: company.name, cnpj };

      // Check sync control
      const { data: sync } = await supabaseAdmin
        .from("dfe_sync_control")
        .select("*")
        .eq("company_id", company.id)
        .maybeSingle();

      diag.sync_control = sync || "nenhum registro";

      // Check notas_recebidas count
      const { count } = await supabaseAdmin
        .from("notas_recebidas")
        .select("id", { count: "exact", head: true })
        .eq("company_id", company.id);

      diag.notas_recebidas_count = count;

      // Try listing documents from Nuvem Fiscal
      try {
        const url = new URL("https://api.nuvemfiscal.com.br/distribuicao/nfe/documentos");
        url.searchParams.set("cpf_cnpj", cnpj);
        url.searchParams.set("ambiente", sandbox === "true" ? "homologacao" : "producao");
        url.searchParams.set("$top", "10");
        url.searchParams.set("$skip", "0");
        url.searchParams.set("$inlinecount", "true");

        const listRes = await nuvemFiscalRequest(url.toString(), { method: "GET" });
        const listText = await listRes.text();

        if (listRes.ok) {
          const listData = JSON.parse(listText);
          diag.nuvem_fiscal_docs_total = listData?.count ?? listData?.["@count"] ?? "?";
          diag.nuvem_fiscal_docs_sample = (listData?.data || []).slice(0, 3).map((d: any) => ({
            chave: d.chave || d.chNFe,
            nsu: d.nsu,
            emitente: d.nome_emitente,
            valor: d.valor_total || d.vNF,
            data: d.data_emissao || d.dh_emissao,
            schema: d.schema,
          }));
        } else {
          diag.nuvem_fiscal_list_error = `HTTP ${listRes.status}: ${listText.slice(0, 500)}`;
        }
      } catch (e: any) {
        diag.nuvem_fiscal_list_error = e.message;
      }

      // Also try a fresh distribution request
      try {
        const distNsu = Number(String(sync?.ultimo_nsu ?? 0).replace(/\D/g, "") || 0);
        const distRes = await nuvemFiscalRequest("https://api.nuvemfiscal.com.br/distribuicao/nfe", {
          method: "POST",
          body: JSON.stringify({
            cpf_cnpj: cnpj,
            ambiente: sandbox === "true" ? "homologacao" : "producao",
            tipo_consulta: "dist-nsu",
            dist_nsu: distNsu,
            ignorar_tempo_espera: true,
          }),
        });
        const distText = await distRes.text();
        diag.distribution_status = distRes.status;
        diag.distribution_response = distText.slice(0, 500);
      } catch (e: any) {
        diag.distribution_error = e.message;
      }

      companyDiags.push(diag);
    }

    results.company_diagnostics = companyDiags;

    return respond(results);
  } catch (err: any) {
    results.fatal_error = err.message;
    return respond(results, 500);
  }
});

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
