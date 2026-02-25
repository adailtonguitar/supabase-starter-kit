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

// ── Upload XML to Storage bucket for 5-year retention ──
async function backupXml(
  supabase: any,
  companyId: string,
  docType: string,
  accessKey: string | null,
  docNumber: number | null,
  xmlContent: string | null,
  event: "emissao" | "cancelamento"
) {
  if (!xmlContent) return;
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const fileName = `${accessKey || docNumber || now.getTime()}_${event}.xml`;
  const filePath = `${companyId}/xml/${docType}/${year}/${month}/${fileName}`;

  try {
    const encoder = new TextEncoder();
    await supabase.storage
      .from("company-backups")
      .upload(filePath, encoder.encode(xmlContent), {
        contentType: "application/xml",
        upsert: true,
      });
    console.log(`XML backup saved: ${filePath}`);
  } catch (err: unknown) {
    console.error("XML backup error:", err);
  }
}

// ── ICMS rate table by state (alíquota interna padrão) ──
const ICMS_RATES_BY_STATE: Record<string, number> = {
  AC: 19, AL: 19, AM: 20, AP: 18, BA: 20.5, CE: 20, DF: 20, ES: 17,
  GO: 19, MA: 22, MG: 18, MS: 17, MT: 17, PA: 19, PB: 20, PE: 20.5,
  PI: 21, PR: 19.5, RJ: 22, RN: 18, RO: 19.5, RR: 20, RS: 17, SC: 17,
  SE: 19, SP: 18, TO: 20,
};

// ── FCP (Fundo de Combate à Pobreza) rates by state ──
// Only states that currently charge FCP on consumer goods
const FCP_RATES_BY_STATE: Record<string, number> = {
  AC: 0, AL: 1, AM: 2, AP: 0, BA: 2, CE: 0, DF: 2, ES: 0,
  GO: 2, MA: 2, MG: 2, MS: 2, MT: 2, PA: 0, PB: 2, PE: 2,
  PI: 2, PR: 0, RJ: 2, RN: 2, RO: 2, RR: 2, RS: 0, SC: 0,
  SE: 2, SP: 0, TO: 2,
};

// ── CSTs that are tax-exempt (no ICMS/FCP calculation needed) ──
const EXEMPT_CST = new Set(["40", "41", "50", "300", "400", "500"]);

// ── Helper: compute FCP for an item ──
function computeFcp(baseCalc: number, uf: string, itemFcpAliquota?: number): { percentual_fcp: number; valor_fcp: number; valor_base_calculo_fcp: number } | null {
  const fcpRate = itemFcpAliquota ?? FCP_RATES_BY_STATE[uf] ?? 0;
  if (fcpRate <= 0) return null;
  const valorFcp = baseCalc * (fcpRate / 100);
  return {
    percentual_fcp: fcpRate,
    valor_fcp: Math.round(valorFcp * 100) / 100,
    valor_base_calculo_fcp: Math.round(baseCalc * 100) / 100,
  };
}

// ── Calculate ICMS + FCP for an item based on CST/CSOSN and state ──
function calculateIcmsForItem(item: any, uf: string, crt: number) {
  const cstCode = String(item.cst || "").trim();
  const isSimples = crt === 1 || crt === 2;

  // For Simples Nacional with common CSOSNs, no ICMS calc needed on NFC-e
  if (isSimples) {
    if (["101", "102", "103", "300", "400", "500"].includes(cstCode)) {
      return { csosn: cstCode, origem: item.origem || "0" };
    }
    // CSOSN 201/202/203 = with ST
    if (["201", "202", "203"].includes(cstCode)) {
      return { csosn: cstCode, origem: item.origem || "0" };
    }
    // CSOSN 900 = Outros - may need aliquota + FCP
    if (cstCode === "900") {
      const aliq = item.icms_aliquota || ICMS_RATES_BY_STATE[uf] || 18;
      const baseCalc = (item.qty || 1) * (item.unit_price || 0) - (item.discount || 0);
      const valor = baseCalc * (aliq / 100);
      const fcp = computeFcp(baseCalc, uf, item.fcp_aliquota);
      return {
        csosn: "900",
        origem: item.origem || "0",
        aliquota: aliq,
        valor: Math.round(valor * 100) / 100,
        ...(fcp ? fcp : {}),
      };
    }
    return { csosn: cstCode, origem: item.origem || "0" };
  }

  // Regime Normal (Lucro Presumido / Real)
  if (EXEMPT_CST.has(cstCode)) {
    return { cst: cstCode, origem: item.origem || "0" };
  }

  const baseCalc = (item.qty || 1) * (item.unit_price || 0) - (item.discount || 0);
  const fcp = computeFcp(baseCalc, uf, item.fcp_aliquota);

  if (cstCode === "00") {
    // Tributada integralmente
    const aliq = item.icms_aliquota || ICMS_RATES_BY_STATE[uf] || 18;
    const valor = baseCalc * (aliq / 100);
    return {
      cst: "00",
      origem: item.origem || "0",
      modalidade_base_calculo: 3,
      valor_base_calculo: Math.round(baseCalc * 100) / 100,
      aliquota: aliq,
      valor: Math.round(valor * 100) / 100,
      ...(fcp ? fcp : {}),
    };
  }

  if (cstCode === "20") {
    // Redução de base
    const aliq = item.icms_aliquota || ICMS_RATES_BY_STATE[uf] || 18;
    const reducao = item.icms_reducao || 0;
    const baseReduzida = baseCalc * (1 - reducao / 100);
    const valor = baseReduzida * (aliq / 100);
    const fcpReduzido = computeFcp(baseReduzida, uf, item.fcp_aliquota);
    return {
      cst: "20",
      origem: item.origem || "0",
      modalidade_base_calculo: 3,
      percentual_reducao: reducao,
      valor_base_calculo: Math.round(baseReduzida * 100) / 100,
      aliquota: aliq,
      valor: Math.round(valor * 100) / 100,
      ...(fcpReduzido ? fcpReduzido : {}),
    };
  }

  if (["10", "30", "60", "70"].includes(cstCode)) {
    // ST-related CSTs
    const aliq = item.icms_aliquota || ICMS_RATES_BY_STATE[uf] || 18;
    const valor = cstCode === "60" ? 0 : baseCalc * (aliq / 100);
    return {
      cst: cstCode,
      origem: item.origem || "0",
      ...(cstCode !== "60" ? {
        modalidade_base_calculo: 3,
        valor_base_calculo: Math.round(baseCalc * 100) / 100,
        aliquota: aliq,
        valor: Math.round(valor * 100) / 100,
        ...(fcp ? fcp : {}),
      } : {}),
    };
  }

  // CST 51 (Diferimento), 90 (Outros)
  const aliq = item.icms_aliquota || ICMS_RATES_BY_STATE[uf] || 18;
  const valor = baseCalc * (aliq / 100);
  return {
    cst: cstCode || "00",
    origem: item.origem || "0",
    modalidade_base_calculo: 3,
    valor_base_calculo: Math.round(baseCalc * 100) / 100,
    aliquota: aliq,
    valor: Math.round(valor * 100) / 100,
    ...(fcp ? fcp : {}),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Use SERVICE_ROLE_KEY for server-side operations (verify_jwt = false in config.toml)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const action = body.action || "emit";

    // ─── BACKUP ALL EXISTING XMLs ───
    if (action === "backup_xmls") {
      const { company_id: bkCompanyId } = body;
      if (!bkCompanyId) return jsonResponse({ error: "company_id obrigatório" }, 400);

      const { data: xmlDocs, error: xmlErr } = await supabase
        .from("fiscal_documents")
        .select("id, doc_type, number, access_key, xml_content, created_at")
        .eq("company_id", bkCompanyId)
        .not("xml_content", "is", null)
        .order("created_at", { ascending: true });

      if (xmlErr) return jsonResponse({ error: xmlErr.message }, 500);

      let backed = 0;
      let skipped = 0;

      for (const doc of xmlDocs || []) {
        const dt = new Date(doc.created_at);
        const year = dt.getFullYear();
        const month = String(dt.getMonth() + 1).padStart(2, "0");
        const fileName = `${doc.access_key || doc.number || doc.id}_emissao.xml`;
        const filePath = `${bkCompanyId}/xml/${doc.doc_type}/${year}/${month}/${fileName}`;

        // Check if already exists
        const { data: existing } = await supabase.storage
          .from("company-backups")
          .list(`${bkCompanyId}/xml/${doc.doc_type}/${year}/${month}`, {
            search: fileName,
          });

        if (existing && existing.length > 0) {
          skipped++;
          continue;
        }

        const encoder = new TextEncoder();
        await supabase.storage
          .from("company-backups")
          .upload(filePath, encoder.encode(doc.xml_content), {
            contentType: "application/xml",
            upsert: true,
          });
        backed++;
      }

      return jsonResponse({
        success: true,
        message: `Backup concluído: ${backed} XMLs salvos, ${skipped} já existiam.`,
        backed,
        skipped,
        total: (xmlDocs || []).length,
      });
    }

    // ─── DOWNLOAD PDF (DANFE) ───
    if (action === "download_pdf") {
      const { access_key, doc_type } = body;
      if (!access_key) return jsonResponse({ error: "Chave de acesso obrigatória" }, 400);

      const token = await getNuvemFiscalToken();
      const endpoint = doc_type === "nfe" ? "nfe" : "nfce";

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
      const { doc_id, access_key, doc_type, justificativa, fiscal_doc_id, sale_id } = body;
      if (!access_key && !doc_id) {
        return jsonResponse({ error: "Chave de acesso ou ID do documento obrigatório" }, 400);
      }
      if (!justificativa || justificativa.length < 15) {
        return jsonResponse({ error: "Justificativa deve ter no mínimo 15 caracteres" }, 400);
      }

      // ── PRAZO LEGAL: verificar se está dentro do prazo de cancelamento ──
      if (fiscal_doc_id) {
        const { data: fiscalDoc } = await supabase
          .from("fiscal_documents")
          .select("created_at, doc_type")
          .eq("id", fiscal_doc_id)
          .single();

        if (fiscalDoc) {
          const createdAt = new Date(fiscalDoc.created_at).getTime();
          const now = Date.now();
          const hoursElapsed = (now - createdAt) / (1000 * 60 * 60);
          const maxHours = fiscalDoc.doc_type === "nfce" ? 24 : 720; // NFC-e=24h, NF-e=30 dias

          if (hoursElapsed > maxHours) {
            return jsonResponse({
              success: false,
              error: `Prazo de cancelamento expirado. ${fiscalDoc.doc_type === "nfce" ? "NFC-e pode ser cancelada em até 24 horas" : "NF-e pode ser cancelada em até 720 horas (30 dias)"}. Documento emitido há ${Math.round(hoursElapsed)} horas.`,
            }, 400);
          }
        }
      }

      const token = await getNuvemFiscalToken();
      const endpoint = doc_type === "nfe" ? "nfe" : "nfce";

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

      if (fiscal_doc_id) {
        await supabase
          .from("fiscal_documents")
          .update({ status: "cancelada" })
          .eq("id", fiscal_doc_id);
      } else if (access_key) {
        await supabase
          .from("fiscal_documents")
          .update({ status: "cancelada" })
          .eq("access_key", access_key);
      }

      if (sale_id) {
        await supabase
          .from("sales")
          .update({ status: "cancelada" })
          .eq("id", sale_id);
      }

      // ── Backup cancel XML ──
      if (cancelData?.xml) {
        await backupXml(supabase, body.company_id || "", doc_type || "nfce", access_key, null, cancelData.xml, "cancelamento");
      }

      return jsonResponse({
        success: true,
        status: "cancelada",
        protocol: cancelData?.protocolo || cancelData?.numero_protocolo || null,
      });
    }

    // ─── INUTILIZAR NUMERAÇÃO ───
    if (action === "inutilize") {
      const { company_id, doc_type, serie, numero_inicial, numero_final, justificativa: inutJust } = body;
      if (!company_id || !doc_type || !serie || !numero_inicial || !numero_final) {
        return jsonResponse({ error: "Dados incompletos para inutilização" }, 400);
      }
      if (!inutJust || inutJust.length < 15) {
        return jsonResponse({ error: "Justificativa deve ter no mínimo 15 caracteres" }, 400);
      }

      const { data: company } = await supabase
        .from("companies")
        .select("cnpj, address_state")
        .eq("id", company_id)
        .single();

      if (!company) return jsonResponse({ error: "Empresa não encontrada" }, 404);

      const { data: config } = await supabase
        .from("fiscal_configs")
        .select("environment")
        .eq("company_id", company_id)
        .eq("doc_type", doc_type)
        .eq("is_active", true)
        .single();

      const token = await getNuvemFiscalToken();
      const endpoint = doc_type === "nfe" ? "nfe" : "nfce";

      const inutPayload = {
        ambiente: config?.environment === "producao" ? "producao" : "homologacao",
        cnpj: company.cnpj?.replace(/\D/g, ""),
        ano: new Date().getFullYear() % 100,
        serie: serie,
        numero_inicial: numero_inicial,
        numero_final: numero_final,
        justificativa: inutJust,
      };

      const inutResp = await fetch(`${NUVEM_FISCAL_API}/${endpoint}/inutilizacoes`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(inutPayload),
      });

      const inutData = await inutResp.json();

      if (!inutResp.ok) {
        console.error("Inutilização error:", JSON.stringify(inutData));
        return jsonResponse({
          success: false,
          error: inutData?.mensagem || inutData?.message || `Erro na inutilização [${inutResp.status}]`,
          details: inutData,
        });
      }

      // Register each number as inutilized in fiscal_documents
      for (let n = numero_inicial; n <= numero_final; n++) {
        await supabase.from("fiscal_documents").insert({
          company_id,
          doc_type,
          number: n,
          serie,
          status: "inutilizada",
          total_value: 0,
          environment: config?.environment || "homologacao",
          is_contingency: false,
        });
      }

      return jsonResponse({
        success: true,
        message: `Numeração ${numero_inicial} a ${numero_final} inutilizada com sucesso.`,
        protocol: inutData?.protocolo || inutData?.numero_protocolo || null,
      });
    }

    // ─── EMIT CONTINGENCY NFC-e (post-sync) ───
    if (action === "emit_contingency") {
      const { sale_id, company_id, config_id, contingency_number, serie, form: contForm, signed_xml } = body;

      if (!company_id || !contForm) {
        return jsonResponse({ error: "Dados de contingência incompletos" }, 400);
      }

      // If we have a locally signed XML, save it directly and skip Nuvem Fiscal emission
      if (signed_xml) {
        console.log(`[Contingency] Received locally signed XML for contingency #${contingency_number}`);

        // Get config for metadata
        let configData = null;
        if (config_id) {
          const { data } = await supabase
            .from("fiscal_configs")
            .select("*")
            .eq("id", config_id)
            .single();
          configData = data;
        }
        if (!configData) {
          const { data } = await supabase
            .from("fiscal_configs")
            .select("*")
            .eq("company_id", company_id)
            .eq("doc_type", "nfce")
            .eq("is_active", true)
            .single();
          configData = data;
        }

        // Extract access key from signed XML
        const keyMatch = (signed_xml as string).match(/Id="NFe(\d{44})"/);
        const accessKey = keyMatch ? keyMatch[1] : null;

        const totalValue = (contForm.items || []).reduce(
          (sum: number, it: any) => sum + (it.qty || 1) * (it.unit_price || 0) - (it.discount || 0),
          0
        );

        // Store the signed XML as fiscal document
        await supabase.from("fiscal_documents").insert({
          company_id,
          sale_id: sale_id || null,
          doc_type: "nfce",
          number: contingency_number,
          serie: serie || configData?.serie || 1,
          access_key: accessKey,
          status: "contingencia",
          total_value: totalValue,
          customer_name: contForm.customer_name || null,
          customer_cpf_cnpj: contForm.customer_doc?.replace(/\D/g, "") || null,
          payment_method: contForm.payment_method,
          environment: configData?.environment || "homologacao",
          is_contingency: true,
          xml_content: signed_xml,
        });

        // Backup the signed XML
        await backupXml(supabase, company_id, "nfce", accessKey, contingency_number, signed_xml, "emissao");

        return jsonResponse({
          success: true,
          access_key: accessKey,
          number: contingency_number,
          status: "contingencia",
          signed_locally: true,
        });
      }

      // No signed XML — fall through to normal emit via Nuvem Fiscal
      // Get config
      let configData = null;
      if (config_id) {
        const { data } = await supabase
          .from("fiscal_configs")
          .select("*")
          .eq("id", config_id)
          .single();
        configData = data;
      }
      if (!configData) {
        const { data } = await supabase
          .from("fiscal_configs")
          .select("*")
          .eq("company_id", company_id)
          .eq("doc_type", "nfce")
          .eq("is_active", true)
          .single();
        configData = data;
      }

      if (!configData) {
        return jsonResponse({ error: "Configuração fiscal NFC-e não encontrada para contingência" }, 404);
      }

      // Now emit as a normal NFC-e but with contingency reference
      body.sale_id = sale_id;
      body.company_id = company_id;
      body.config_id = configData.id;
      body.form = contForm;
      body.form.inf_adic = `NFC-e emitida em contingência offline. Nº contingência: ${contingency_number}. ${contForm.inf_adic || ""}`.trim();
      // Fall through to normal emit below
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

    // ── Validate items before building payload ──
    const formItems = form.items || [];
    for (let i = 0; i < formItems.length; i++) {
      const it = formItems[i];
      const ncmClean = (it.ncm || "").replace(/\D/g, "");
      if (!ncmClean || ncmClean === "00000000" || ncmClean.length < 4) {
        return jsonResponse({ error: `Item ${i + 1} ("${it.name || ""}"): NCM inválido ou não informado. NCM é obrigatório para evitar multa na SEFAZ.` }, 400);
      }
      if (!it.cfop || it.cfop.length !== 4) {
        return jsonResponse({ error: `Item ${i + 1} ("${it.name || ""}"): CFOP inválido ou não informado.` }, 400);
      }
      if (!it.cst) {
        return jsonResponse({ error: `Item ${i + 1} ("${it.name || ""}"): CST/CSOSN não informado.` }, 400);
      }
    }

    const crt = form.crt || config.crt || 1;
    const uf = (company.address_state || "SP").toUpperCase();

    const items = formItems.map((item: any, idx: number) => {
      const icmsCalc = calculateIcmsForItem(item, uf, crt);

      return {
        numero_item: idx + 1,
        codigo_produto: item.product_code || String(idx + 1).padStart(5, "0"),
        descricao: item.name,
        ncm: item.ncm.replace(/\D/g, ""),
        cfop: item.cfop,
        unidade_comercial: item.unit || "UN",
        quantidade_comercial: item.qty || 1,
        valor_unitario_comercial: item.unit_price || 0,
        valor_bruto: (item.qty || 1) * (item.unit_price || 0),
        unidade_tributavel: item.unit || "UN",
        quantidade_tributavel: item.qty || 1,
        valor_unitario_tributavel: item.unit_price || 0,
        valor_desconto: item.discount || 0,
        imposto: {
          icms: icmsCalc,
          pis: { cst: item.pis_cst || "49" },
          cofins: { cst: item.cofins_cst || "49" },
        },
      };
    });

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
          uf: uf,
          cep: company.address_zip?.replace(/\D/g, "") || "",
          codigo_pais: "1058",
          pais: "BRASIL",
        },
        crt: crt,
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
      // Extract rejection code from Nuvem Fiscal response
      const rejCode = emitData?.codigo_status || emitData?.cStat || emitData?.status_sefaz?.cStat || null;
      const rejMsg = emitData?.motivo_status || emitData?.xMotivo || emitData?.status_sefaz?.xMotivo || null;
      return jsonResponse({
        success: false,
        error: emitData?.mensagem || emitData?.message || `Erro Nuvem Fiscal [${emitResp.status}]`,
        rejection_code: rejCode ? String(rejCode) : null,
        rejection_reason: rejMsg || null,
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

    // ── Auto-backup XML to Storage ──
    await backupXml(supabase, company_id, "nfce", accessKey, docNumber, emitData.xml || null, "emissao");

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
