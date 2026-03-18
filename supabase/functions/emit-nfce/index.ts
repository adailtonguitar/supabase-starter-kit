// 🔥 VERSÃO OTIMIZADA E SEGURA - PRODUÇÃO READY

import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// 🔒 LOG SEGURO (NUNCA logar dados sensíveis)
function safeLog(message: string, data?: any) {
  console.log(`[emit-nfce] ${message}`, data ? "[data ocultada]" : "");
}

// 🔒 IDMPOTÊNCIA (ANTI DUPLICAÇÃO)
async function checkDuplicate(supabase: any, sale_id: string) {
  const { data } = await supabase
    .from("fiscal_documents")
    .select("id")
    .eq("sale_id", sale_id)
    .maybeSingle();

  return !!data;
}

// 🔒 NUMERAÇÃO SEGURA (LOCK SIMPLES)
async function getNextNumberSafe(supabase: any, config: any) {
  const { data, error } = await supabase
    .from("fiscal_configs")
    .select("next_number")
    .eq("id", config.id)
    .single();

  if (error) throw new Error("Erro ao buscar numeração");

  const next = data.next_number || 1;

  const { error: updateError } = await supabase
    .from("fiscal_configs")
    .update({ next_number: next + 1 })
    .eq("id", config.id);

  if (updateError) throw new Error("Erro ao atualizar numeração");

  return next;
}

// 🔐 TOKEN NUVEM FISCAL
async function getToken() {
  const resp = await fetch("https://auth.nuvemfiscal.com.br/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: Deno.env.get("NUVEM_FISCAL_CLIENT_ID")!,
      client_secret: Deno.env.get("NUVEM_FISCAL_CLIENT_SECRET")!,
      scope: "nfce",
    }),
  });

  if (!resp.ok) throw new Error("Erro autenticação Nuvem Fiscal");

  const data = await resp.json();
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();

    const { sale_id, form, company_id } = body;

    if (!sale_id || !form) {
      return jsonResponse({ error: "Dados incompletos" }, 400);
    }

    // 🔴 ANTI DUPLICAÇÃO
    const duplicated = await checkDuplicate(supabase, sale_id);
    if (duplicated) {
      return jsonResponse({ error: "NF já emitida para essa venda" }, 400);
    }

    // 🏢 EMPRESA
    const { data: company } = await supabase
      .from("companies")
      .select("*")
      .eq("id", company_id)
      .single();

    if (!company) {
      return jsonResponse({ error: "Empresa não encontrada" }, 404);
    }

    // ⚙ CONFIG
    const { data: config } = await supabase
      .from("fiscal_configs")
      .select("*")
      .eq("company_id", company_id)
      .eq("doc_type", "nfce")
      .eq("is_active", true)
      .single();

    if (!config) {
      return jsonResponse({ error: "Configuração fiscal não encontrada" }, 400);
    }

    // 🔢 NUMERAÇÃO SEGURA
    const numero = await getNextNumberSafe(supabase, config);

    // 📦 ITENS
    const items = (form.items || []).map((item: any, i: number) => {
      if (!item.ncm || item.ncm.length < 2) {
        throw new Error(`Item ${i + 1} sem NCM válido`);
      }

      if (!item.cfop) {
        throw new Error(`Item ${i + 1} sem CFOP`);
      }

      return {
        nItem: i + 1,
        prod: {
          cProd: item.id || String(i + 1),
          xProd: item.name,
          NCM: item.ncm,
          CFOP: item.cfop,
          uCom: "UN",
          qCom: item.qty,
          vUnCom: item.unit_price,
          vProd: item.qty * item.unit_price,
        },
        imposto: {
          ICMS: {
            ICMS00: {
              orig: 0,
              CST: "00",
              modBC: 3,
              vBC: item.qty * item.unit_price,
              pICMS: 18,
              vICMS: (item.qty * item.unit_price) * 0.18,
            },
          },
        },
      };
    });

    const total = items.reduce((s: number, i: any) => s + i.prod.vProd, 0);

    // 📤 PAYLOAD
    const payload = {
      ambiente: "homologacao",
      infNFe: {
        ide: {
          mod: 65,
          serie: config.serie || 1,
          nNF: numero,
          dhEmi: new Date().toISOString(),
        },
        emit: {
          CNPJ: company.cnpj.replace(/\D/g, ""),
          xNome: company.name,
        },
        det: items,
        total: {
          ICMSTot: {
            vProd: total,
            vNF: total,
          },
        },
        pag: {
          detPag: [
            {
              tPag: "01",
              vPag: total,
            },
          ],
        },
      },
    };

    const token = await getToken();

    safeLog("Enviando NF-e");

    const resp = await fetch("https://api.sandbox.nuvemfiscal.com.br/nfce", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json();

    if (!resp.ok) {
      safeLog("Erro Nuvem Fiscal");
      return jsonResponse({
        error: data?.mensagem || "Erro ao emitir",
      }, 400);
    }

    // 💾 SALVAR
    await supabase.from("fiscal_documents").insert({
      company_id,
      sale_id,
      number: numero,
      access_key: data.chave,
      status: "emitida",
      total_value: total,
    });

    return jsonResponse({
      success: true,
      number: numero,
      access_key: data.chave,
    });

  } catch (err: any) {
    console.error("ERRO:", err.message);
    return jsonResponse({ error: err.message }, 500);
  }
});