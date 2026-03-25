import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://anthosystemcombr.lovable.app",
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const token = authHeader.replace("Bearer ", "");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    const user = { id: claimsData.claims.sub as string };

    const body = await req.json();
    const { year, month, company_id } = body;

    if (!year || !month) {
      return new Response(JSON.stringify({ error: "Ano e mês são obrigatórios" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    let companyId = company_id;
    if (!companyId) {
      const { data: cu } = await adminClient
        .from("company_users")
        .select("company_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      companyId = cu?.company_id;
    }

    if (!companyId) {
      return new Response(JSON.stringify({ error: "Empresa não encontrada" }), {
        status: 404,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { data: membership } = await adminClient
      .from("company_users")
      .select("id")
      .eq("user_id", user.id)
      .eq("company_id", companyId)
      .eq("is_active", true)
      .maybeSingle();

    if (!membership) {
      return new Response(JSON.stringify({ error: "Acesso negado a esta empresa" }), {
        status: 403,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { data: company } = await adminClient
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .single();

    if (!company) {
      return new Response(JSON.stringify({ error: "Empresa não encontrada" }), {
        status: 404,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabase = adminClient;
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endMonth = month === 12 ? 1 : month + 1;
    const endYear = month === 12 ? year + 1 : year;
    const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

    // Buscar documentos fiscais E seus itens de venda
    const { data: docs } = await supabase
      .from("fiscal_documents")
      .select("*")
      .eq("company_id", companyId)
      .gte("created_at", startDate)
      .lt("created_at", endDate)
      .order("created_at", { ascending: true });

    const fiscalDocs = docs || [];

    // Buscar sale_items para todos os documentos com sale_id
    const saleIds = fiscalDocs.filter((d: any) => d.sale_id).map((d: any) => d.sale_id);
    let allSaleItems: any[] = [];
    if (saleIds.length > 0) {
      const { data: items } = await supabase
        .from("sale_items")
        .select("*, products(ncm, cfop, csosn, cst_icms, aliq_icms, origem, cest)")
        .in("sale_id", saleIds);
      allSaleItems = items || [];
    }

    const period = `${String(month).padStart(2, "0")}/${year}`;
    const lines: string[] = [];
    const cnpj = (company.cnpj || "").replace(/\D/g, "");
    const ie = (company.state_registration || company.ie || "").replace(/\D/g, "");
    const uf = company.address_state || company.state || "";
    const codMun = company.address_city_code || company.ibge_code || company.city_code || "";
    const dtIni = `01${String(month).padStart(2, "0")}${year}`;
    const lastDay = new Date(year, month, 0).getDate();
    const dtFin = `${lastDay}${String(month).padStart(2, "0")}${year}`;
    const crt = company.crt || 1;

    // ═══ Bloco 0 — Abertura ═══
    lines.push(`|0000|017|0|${dtIni}|${dtFin}|${company.name || ""}|${cnpj}|${uf}|${ie}|||${codMun}|||A|1|`);
    lines.push(`|0001|0|`);
    lines.push(`|0005|${company.trade_name || company.name || ""}|${(company.zip_code || company.address_zip || "").replace(/\D/g, "")}|${company.street || company.address_street || ""}|${company.number || company.address_number || ""}|${company.complement || company.address_complement || ""}|${company.neighborhood || company.address_neighborhood || ""}||||`);
    lines.push(`|0100|||||||||||||||||`);

    // Registro 0200 — Produtos utilizados no período
    const productMap = new Map<string, any>();
    allSaleItems.forEach((item: any) => {
      if (!productMap.has(item.product_id)) {
        const p = item.products || {};
        productMap.set(item.product_id, {
          name: item.product_name || item.name,
          ncm: (p.ncm || "").replace(/\D/g, ""),
          unit: item.unit || "UN",
          cest: p.cest || "",
        });
      }
    });

    productMap.forEach((prod, id) => {
      lines.push(`|0200|${id}|${prod.name}||${prod.ncm}||${prod.unit}|0|0|||${prod.cest}|`);
    });

    lines.push(`|0990|${lines.length + 1}|`);

    // ═══ Bloco C — Documentos Fiscais ═══
    lines.push(`|C001|${fiscalDocs.length > 0 ? "0" : "1"}|`);

    let cLineCount = 2;
    let totalIcmsBC = 0;
    let totalIcms = 0;

    fiscalDocs.forEach((doc: any) => {
      const docDate = new Date(doc.created_at);
      const dtDoc = `${String(docDate.getDate()).padStart(2, "0")}${String(docDate.getMonth() + 1).padStart(2, "0")}${docDate.getFullYear()}`;
      const chave = doc.access_key || "";
      const numDoc = String(doc.number || 0).padStart(9, "0");
      const serie = String(doc.serie || 1).padStart(3, "0");
      const valor = formatDecimal(doc.total_value || 0);
      const modelo = doc.doc_type === "nfe" ? "55" : "65";
      const indOper = doc.doc_type === "nfe" ? "0" : "1";

      // C100 — Documento fiscal
      lines.push(`|C100|${indOper}|0||${modelo}|00|${serie}|${numDoc}|${chave}|${dtDoc}|${dtDoc}|${valor}|0|0,00|${valor}|0|0,00|0,00|0,00|0,00|0,00|0,00|0,00|0,00|0,00|0,00|0,00|`);
      cLineCount++;

      // C170 — Itens do documento
      const docItems = allSaleItems.filter((si: any) => si.sale_id === doc.sale_id);
      docItems.forEach((item: any, idx: number) => {
        const p = item.products || {};
        const qty = item.quantity || 1;
        const unitPrice = item.unit_price || 0;
        const vProd = Math.round(qty * unitPrice * 100) / 100;
        const discountValue = Math.round(((item.discount_percent || 0) / 100) * vProd * 100) / 100;
        const vProdLiq = vProd - discountValue;
        const ncm = (p.ncm || "").replace(/\D/g, "");
        const cfop = p.cfop || "5102";
        const cst = crt <= 2 ? (p.csosn || "102") : (p.cst_icms || "00");
        const aliq = p.aliq_icms || 0;
        const vICMS = Math.round(vProdLiq * (aliq / 100) * 100) / 100;
        const origem = p.origem || "0";

        totalIcmsBC += vProdLiq;
        totalIcms += vICMS;

        lines.push(
          `|C170|${idx + 1}|${item.product_id}|${item.product_name || ""}|${ncm}|` +
          `${formatDecimal(qty)}|${item.unit || "UN"}|${formatDecimal(vProd)}|${formatDecimal(discountValue)}|` +
          `0|${cfop}|${origem}${cst}|${formatDecimal(vProdLiq)}|${formatDecimal(aliq)}|${formatDecimal(vICMS)}|` +
          `0,00|0,00|0,00|0,00|0,00|0,00|0,00|`
        );
        cLineCount++;
      });
    });

    lines.push(`|C990|${cLineCount}|`);

    // ═══ Bloco D — Serviços (sem movimento) ═══
    lines.push(`|D001|1|`);
    lines.push(`|D990|2|`);

    // ═══ Bloco E — Apuração ICMS ═══
    lines.push(`|E001|0|`);

    // E100 — Período de apuração
    lines.push(`|E100|${dtIni}|${dtFin}|`);

    // E110 — Apuração do ICMS
    const vTotalBC = Math.round(totalIcmsBC * 100) / 100;
    const vTotalICMS = Math.round(totalIcms * 100) / 100;
    const saldoDevedor = Math.max(0, vTotalICMS);
    lines.push(
      `|E110|${formatDecimal(vTotalBC)}|${formatDecimal(vTotalICMS)}|0,00|0,00|0,00|0,00|0,00|0,00|0,00|0,00|0,00|${formatDecimal(saldoDevedor)}|0,00|`
    );

    lines.push(`|E990|5|`);

    // ═══ Blocos G, H, K, 1 — Sem movimento ═══
    lines.push(`|G001|1|`);
    lines.push(`|G990|2|`);
    lines.push(`|H001|1|`);
    lines.push(`|H990|2|`);
    lines.push(`|K001|1|`);
    lines.push(`|K990|2|`);
    lines.push(`|1001|1|`);
    lines.push(`|1990|2|`);

    // ═══ Bloco 9 — Totais ═══
    const totalLines = lines.length + 3;
    lines.push(`|9001|0|`);
    lines.push(`|9900|9999|1|`);
    lines.push(`|9990|${totalLines}|`);
    lines.push(`|9999|${totalLines + 1}|`);

    const spedContent = lines.join("\n");

    const filePath = `sped/${companyId}/${year}_${String(month).padStart(2, "0")}_SPED.txt`;
    const { error: uploadErr } = await supabase.storage
      .from("company-backups")
      .upload(filePath, new TextEncoder().encode(spedContent), {
        contentType: "text/plain",
        upsert: true,
      });

    if (uploadErr) {
      console.error("Upload error:", uploadErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        period,
        docs_count: fiscalDocs.length,
        items_count: allSaleItems.length,
        file_path: filePath,
        lines_count: lines.length,
      }),
      { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("generate-sped error:", err);
    const message = err instanceof Error ? err.message : "Erro interno";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});

function formatDecimal(value: number): string {
  return value.toFixed(2).replace(".", ",");
}
