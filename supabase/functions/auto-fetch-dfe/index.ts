import { createClient } from "npm:@supabase/supabase-js@2";
import { nuvemFiscalRequest } from "../_shared/nuvem-fiscal-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const results: { company: string; new_docs: number; errors: string[] }[] = [];

  try {
    const { data: companies } = await supabaseAdmin
      .from("companies")
      .select("id, cnpj, name")
      .not("cnpj", "is", null)
      .eq("is_demo", false);

    if (!companies || companies.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "Nenhuma empresa para consultar" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const company of companies) {
      const cnpj = (company.cnpj || "").replace(/\D/g, "");
      if (cnpj.length !== 14) continue;

      const companyResult = { company: company.name || cnpj, new_docs: 0, errors: [] as string[] };

      try {
        // 1. Distribute (request new documents from SEFAZ)
        const { data: lastDoc } = await supabaseAdmin
          .from("notas_recebidas")
          .select("nsu")
          .eq("company_id", company.id)
          .order("nsu", { ascending: false })
          .limit(1)
          .maybeSingle();

        const normalizedLastNsu = Number(String(lastDoc?.nsu ?? 0).replace(/\D/g, "") || 0);

        await nuvemFiscalRequest("https://api.nuvemfiscal.com.br/distribuicao/nfe", {
          method: "POST",
          body: JSON.stringify({
            cpf_cnpj: cnpj,
            ambiente: "producao",
            tipo_consulta: "dist-nsu",
            dist_nsu: normalizedLastNsu,
            ignorar_tempo_espera: true,
          }),
        });

        // 2. Wait briefly then fetch documents
        await new Promise((r) => setTimeout(r, 3000));

        const url = new URL("https://api.nuvemfiscal.com.br/distribuicao/nfe/documentos");
        url.searchParams.set("cpf_cnpj", cnpj);
        url.searchParams.set("ambiente", "producao");
        url.searchParams.set("$top", "50");
        url.searchParams.set("$skip", "0");
        url.searchParams.set("$inlinecount", "true");

        const listRes = await nuvemFiscalRequest(url.toString(), { method: "GET" });
        if (!listRes.ok) {
          companyResult.errors.push(`Erro ao listar: ${listRes.status}`);
          results.push(companyResult);
          continue;
        }

        const listData = await listRes.json();
        const docs = listData?.data || [];

        for (const d of docs) {
          const chave = d.chave || d.chNFe;
          if (!chave) continue;

          const { data: existing } = await supabaseAdmin
            .from("notas_recebidas")
            .select("id, status_manifestacao")
            .eq("company_id", company.id)
            .eq("chave_nfe", chave)
            .maybeSingle();

          if (!existing) {
            const { error: insertErr } = await supabaseAdmin.from("notas_recebidas").insert({
              company_id: company.id,
              chave_nfe: chave,
              nsu: d.nsu || 0,
              cnpj_emitente: d.cnpj_emitente || "",
              nome_emitente: d.nome_emitente || "",
              data_emissao: d.data_emissao || d.dh_emissao || null,
              valor_total: d.valor_total || d.vNF || 0,
              numero_nfe: d.numero || 0,
              serie: d.serie || 0,
              schema_tipo: d.schema || "NF-e",
              situacao: "resumo",
              nuvem_fiscal_id: d.id || null,
            });

            if (!insertErr) {
              companyResult.new_docs++;

              // Auto-manifest (ciência da operação)
              if (d.id) {
                try {
                  const mRes = await nuvemFiscalRequest(
                    `https://api.nuvemfiscal.com.br/distribuicao/nfe/documentos/${d.id}/manifestacao`,
                    {
                      method: "POST",
                      body: JSON.stringify({ tipo_evento: "ciencia" }),
                    }
                  );
                  if (mRes.ok) {
                    await supabaseAdmin.from("notas_recebidas").update({
                      status_manifestacao: "ciencia",
                      situacao: "manifesto",
                      updated_at: new Date().toISOString(),
                    }).eq("company_id", company.id).eq("chave_nfe", chave);
                  }
                } catch (mErr: any) {
                  companyResult.errors.push(`Manifestação falhou para ${chave}: ${mErr.message}`);
                }
              }
            }
          }
        }

        // 3. Create notification if new docs found
        if (companyResult.new_docs > 0) {
          const { data: companyUsers } = await supabaseAdmin
            .from("company_users")
            .select("user_id")
            .eq("company_id", company.id)
            .limit(1);

          if (companyUsers && companyUsers.length > 0) {
            await supabaseAdmin.from("admin_notifications").insert({
              title: `${companyResult.new_docs} nova(s) NF-e encontrada(s)`,
              message: `Foram encontradas ${companyResult.new_docs} novas notas fiscais emitidas contra o CNPJ da empresa ${company.name || ""}. Acesse a Consulta DF-e para visualizar e importar.`,
              type: "info",
              target_company_id: company.id,
            });
          }
        }

        // Update sync control
        await supabaseAdmin.from("dfe_sync_control").upsert({
          company_id: company.id,
          ultima_consulta: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "company_id" });

      } catch (compErr: any) {
        companyResult.errors.push(compErr.message);
      }

      results.push(companyResult);
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
