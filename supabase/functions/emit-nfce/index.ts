import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NUVEM_FISCAL_API = "https://api.nuvemfiscal.com.br";

async function getNuvemFiscalToken(): Promise<string> {
  const clientId = Deno.env.get("NUVEM_FISCAL_CLIENT_ID");
  const clientSecret = Deno.env.get("NUVEM_FISCAL_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("Credenciais Nuvem Fiscal não configuradas");

  const resp = await fetch(`${NUVEM_FISCAL_API}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "cep cnpj nfce nfe",
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Erro auth Nuvem Fiscal [${resp.status}]: ${errText}`);
  }

  const data = await resp.json();
  return data.access_token;
}

function jsonResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Não autorizado" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonResponse({ error: "Não autorizado" }, 401);
    }

    const body = await req.json();
    const action = body.action || "emit";

    // ─── DOWNLOAD PDF (DANFE) ───
    if (action === "download_pdf") {
      const { access_key, doc_type } = body;
      if (!access_key) return jsonResponse({ error: "Chave de acesso obrigatória" }, 400);

      const token = await getNuvemFiscalToken();
      const endpoint = doc_type === "nfe" ? "nfe" : "nfce";

      // First find the document by access key
      const searchResp = await fetch(
        `${NUVEM_FISCAL_API}/${endpoint}?chave=${access_key}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!searchResp.ok) {
        const errData = await searchResp.json();
        return jsonResponse({
          error: errData?.mensagem || `Documento não encontrado [${searchResp.status}]`,
        });
      }

      const searchData = await searchResp.json();
      const docId = searchData?.data?.[0]?.id || searchData?.id;

      if (!docId) {
        return jsonResponse({ error: "Documento não encontrado na Nuvem Fiscal" });
      }

      // Download PDF
      const pdfResp = await fetch(
        `${NUVEM_FISCAL_API}/${endpoint}/${docId}/pdf`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!pdfResp.ok) {
        const errText = await pdfResp.text();
        return jsonResponse({ error: `Erro ao gerar PDF [${pdfResp.status}]: ${errText}` });
      }

      const pdfBuffer = await pdfResp.arrayBuffer();
      const pdfBytes = new Uint8Array(pdfBuffer);
      let binaryStr = "";
      for (let i = 0; i < pdfBytes.length; i++) {
        binaryStr += String.fromCharCode(pdfBytes[i]);
      }
      const pdfBase64 = btoa(binaryStr);

      return jsonResponse({ success: true, pdf_base64: pdfBase64 });
    }

    // ─── CANCEL NFC-e / NF-e ───
    if (action === "cancel") {
      const { doc_id, access_key, doc_type, justificativa } = body;
      if (!access_key && !doc_id) {
        return jsonResponse({ error: "Chave de acesso ou ID do documento obrigatório" }, 400);
      }
      if (!justificativa || justificativa.length < 15) {
        return jsonResponse({ error: "Justificativa deve ter no mínimo 15 caracteres" }, 400);
      }

      const token = await getNuvemFiscalToken();
      const endpoint = doc_type === "nfe" ? "nfe" : "nfce";

      // Find document ID if not provided
      let nuvemId = doc_id;
      if (!nuvemId && access_key) {
        const searchResp = await fetch(
          `${NUVEM_FISCAL_API}/${endpoint}?chave=${access_key}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (searchResp.ok) {
          const searchData = await searchResp.json();
          nuvemId = searchData?.data?.[0]?.id || searchData?.id;
        }
      }

      if (!nuvemId) {
        return jsonResponse({ error: "Documento não encontrado na Nuvem Fiscal" });
      }

      // Cancel
      const cancelResp = await fetch(
        `${NUVEM_FISCAL_API}/${endpoint}/${nuvemId}/cancelamento`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ justificativa }),
        }
      );

      const cancelData = await cancelResp.json();

      if (!cancelResp.ok) {
        console.error("Cancel error:", JSON.stringify(cancelData));
        return jsonResponse({
          success: false,
          error: cancelData?.mensagem || cancelData?.message || `Erro ao cancelar [${cancelResp.status}]`,
          details: cancelData,
        });
      }

      // Update local DB
      if (body.fiscal_doc_id) {
        await supabase
          .from("fiscal_documents")
          .update({ status: "cancelada" })
          .eq("id", body.fiscal_doc_id);
      } else if (access_key) {
        await supabase
          .from("fiscal_documents")
          .update({ status: "cancelada" })
          .eq("access_key", access_key);
      }

      // Update sale if linked
      if (body.sale_id) {
        await supabase
          .from("sales")
          .update({ status: "cancelada" })
          .eq("id", body.sale_id);
      }

      return jsonResponse({
        success: true,
        status: "cancelada",
        protocol: cancelData?.protocolo || cancelData?.numero_protocolo || null,
      });
    }

    // ─── EMIT NFC-e (default) ───
    const { sale_id, company_id, config_id, form } = body;

    if (!sale_id || !company_id || !config_id || !form) {
      return jsonResponse({ error: "Dados incompletos" }, 400);
    }

    const { data: config, error: cfgErr } = await supabase
      .from("fiscal_configs")
      .select("*")
      .eq("id", config_id)
      .single();

    if (cfgErr || !config) {
      return jsonResponse({ error: "Configuração fiscal não encontrada" }, 404);
    }

    const { data: company } = await supabase
      .from("companies")
      .select("name, trade_name, cnpj, state_registration, address_street, address_number, address_complement, address_neighborhood, address_city, address_city_code, address_state, address_zip")
      .eq("id", company_id)
      .single();

    if (!company) {
      return jsonResponse({ error: "Empresa não encontrada" }, 404);
    }

    const items = (form.items || []).map((item: any, idx: number) => ({
      numero_item: idx + 1,
      codigo_produto: String(idx + 1).padStart(5, "0"),
      descricao: item.name,
      ncm: item.ncm?.replace(/\D/g, "") || "00000000",
      cfop: item.cfop || "5102",
      unidade_comercial: item.unit || "UN",
      quantidade_comercial: item.qty || 1,
      valor_unitario_comercial: item.unit_price || 0,
      valor_bruto: (item.qty || 1) * (item.unit_price || 0),
      unidade_tributavel: item.unit || "UN",
      quantidade_tributavel: item.qty || 1,
      valor_unitario_tributavel: item.unit_price || 0,
      valor_desconto: item.discount || 0,
      imposto: {
        icms: { csosn: item.cst || "102", origem: "0" },
        pis: { cst: "49" },
        cofins: { cst: "49" },
      },
    }));

    const totalValue = items.reduce(
      (sum: number, it: any) => sum + it.valor_bruto - (it.valor_desconto || 0),
      0
    );

    const paymentMethodMap: Record<string, string> = {
      "01": "01", "02": "02", "03": "03", "04": "04", "05": "05",
      "10": "10", "11": "11", "13": "13", "15": "15", "16": "16", "17": "17", "99": "99",
    };

    const nfcePayload = {
      ambiente: config.environment === "producao" ? "producao" : "homologacao",
      natureza_operacao: form.nat_op || "VENDA DE MERCADORIA",
      tipo_documento: 1,
      finalidade_emissao: 1,
      consumidor_final: 1,
      presenca_comprador: 1,
      notas_referenciadas: [],
      emitente: {
        cnpj: company.cnpj?.replace(/\D/g, ""),
        nome: company.name,
        nome_fantasia: company.trade_name || company.name,
        inscricao_estadual: company.state_registration?.replace(/\D/g, "") || "",
        endereco: {
          logradouro: company.address_street || "",
          numero: company.address_number || "S/N",
          complemento: company.address_complement || "",
          bairro: company.address_neighborhood || "",
          codigo_municipio: company.address_city_code || "",
          nome_municipio: company.address_city || "",
          uf: company.address_state || "",
          cep: company.address_zip?.replace(/\D/g, "") || "",
          codigo_pais: "1058",
          pais: "BRASIL",
        },
        crt: 1,
      },
      destinatario: form.customer_doc
        ? {
            ...(form.customer_doc.replace(/\D/g, "").length <= 11
              ? { cpf: form.customer_doc.replace(/\D/g, "") }
              : { cnpj: form.customer_doc.replace(/\D/g, "") }),
            nome: form.customer_name || undefined,
          }
        : undefined,
      itens: items,
      pagamento: {
        formas_pagamento: [
          {
            tipo: paymentMethodMap[form.payment_method] || "99",
            valor: form.payment_value || totalValue,
          },
        ],
        troco: form.change || 0,
      },
      informacoes_adicionais: {
        informacoes_contribuinte: form.inf_adic || undefined,
      },
    };

    const token = await getNuvemFiscalToken();

    const emitResp = await fetch(`${NUVEM_FISCAL_API}/nfce`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(nfcePayload),
    });

    const emitData = await emitResp.json();

    if (!emitResp.ok) {
      console.error("Nuvem Fiscal error:", JSON.stringify(emitData));
      return jsonResponse({
        success: false,
        error: emitData?.mensagem || emitData?.message || `Erro Nuvem Fiscal [${emitResp.status}]`,
        details: emitData,
      });
    }

    const accessKey = emitData.chave || emitData.chave_acesso || null;
    const docNumber = emitData.numero || config.next_number || null;
    const status = emitData.status === "autorizada" ? "autorizada" : emitData.status || "pendente";

    await supabase.from("fiscal_documents").insert({
      company_id,
      sale_id,
      doc_type: "nfce",
      number: docNumber,
      serie: config.serie,
      access_key: accessKey,
      status,
      total_value: totalValue,
      customer_name: form.customer_name || null,
      customer_cpf_cnpj: form.customer_doc?.replace(/\D/g, "") || null,
      payment_method: form.payment_method,
      environment: config.environment,
      is_contingency: false,
      xml_content: emitData.xml || null,
      nuvem_fiscal_id: emitData.id || null,
    });

    await supabase
      .from("sales")
      .update({ status: "autorizada", access_key: accessKey, number: docNumber })
      .eq("id", sale_id);

    await supabase
      .from("fiscal_configs")
      .update({ next_number: (config.next_number || 1) + 1 })
      .eq("id", config_id);

    return jsonResponse({
      success: true,
      access_key: accessKey,
      number: docNumber,
      status,
      nuvem_fiscal_id: emitData.id,
    });
  } catch (err: unknown) {
    console.error("emit-nfce error:", err);
    const message = err instanceof Error ? err.message : "Erro interno";
    return jsonResponse({ success: false, error: message }, 500);
  }
});
