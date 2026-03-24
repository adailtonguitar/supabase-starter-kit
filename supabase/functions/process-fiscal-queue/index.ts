import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json().catch(() => ({}));
    const companyFilter = body.company_id;

    // 1️⃣ Resetar itens presos em "processing" há mais de 5 minutos
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const stuckQuery = supabase
      .from("fiscal_queue")
      .update({ status: "pending" })
      .eq("status", "processing")
      .lt("updated_at", fiveMinAgo);

    if (companyFilter) stuckQuery.eq("company_id", companyFilter);
    await stuckQuery;

    // 2️⃣ Buscar próximo item pendente
    let pendingQuery: any = supabase
      .from("fiscal_queue")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1);

    if (companyFilter) pendingQuery = pendingQuery.eq("company_id", companyFilter);
    pendingQuery = pendingQuery.maybeSingle();
    const { data: queueItem } = await pendingQuery;

    if (!queueItem) {
      return new Response(
        JSON.stringify({ success: true, message: "Nenhum item pendente" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const queueId = queueItem.id;
    const saleId = queueItem.sale_id;
    const companyId = queueItem.company_id;
    const attempts = (queueItem.attempts || 0) + 1;
    const MAX_RETRIES = 10;

    // Dead-letter: mover para erro definitivo após máximo de tentativas
    if (attempts > MAX_RETRIES) {
      await Promise.all([
        supabase.from("fiscal_queue")
          .update({ status: "dead_letter", last_error: `Excedeu ${MAX_RETRIES} tentativas`, updated_at: new Date().toISOString() })
          .eq("id", queueId),
        supabase.from("sales")
          .update({ status: "erro_fiscal" })
          .eq("id", saleId)
          .eq("company_id", companyId),
      ]);
      return new Response(
        JSON.stringify({ success: false, dead_letter: true, sale_id: saleId, error: `Excedeu ${MAX_RETRIES} tentativas` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3️⃣ Marcar como processing
    await supabase
      .from("fiscal_queue")
      .update({ status: "processing", attempts, updated_at: new Date().toISOString() })
      .eq("id", queueId);

    // 4️⃣ Buscar config fiscal com fallback (NFC-e -> NF-e)
    const { data: configs, error: cfgErr } = await supabase
      .from("fiscal_configs")
      .select("id, doc_type, is_active")
      .eq("company_id", companyId);

    const fiscalConfig = configs?.find((c: any) => c.doc_type === "nfce" && c.is_active)
      || configs?.find((c: any) => c.doc_type === "nfe" && c.is_active)
      || configs?.find((c: any) => c.doc_type === "nfce")
      || configs?.find((c: any) => c.doc_type === "nfe")
      || configs?.[0]
      || null;

    if (cfgErr || !fiscalConfig) {
      const reason = cfgErr?.message || "Nenhuma configuração fiscal encontrada";
      await Promise.all([
        supabase.from("fiscal_queue")
          .update({ status: "error", last_error: reason })
          .eq("id", queueId),
        supabase.from("sales")
          .update({ status: "pendente_fiscal" })
          .eq("id", saleId)
          .eq("company_id", companyId),
      ]);
      return new Response(
        JSON.stringify({ success: false, error: reason, sale_id: saleId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5️⃣ Buscar dados da venda e itens (incluindo dados fiscais do produto)
    const [{ data: sale }, { data: items }, { data: company }] = await Promise.all([
      supabase.from("sales").select("*").eq("id", saleId).single(),
      supabase.from("sale_items").select("*, products(ncm, cfop, csosn, cst_icms, cst_pis, cst_cofins, aliq_icms, origem, mva)").eq("sale_id", saleId),
      supabase.from("companies").select("crt").eq("id", companyId).maybeSingle(),
    ]);

    if (!sale || !items?.length) {
      await supabase.from("fiscal_queue")
        .update({ status: "error", last_error: "Venda ou itens não encontrados" })
        .eq("id", queueId);
      return new Response(
        JSON.stringify({ success: false, error: "Venda ou itens não encontrados", sale_id: saleId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: latestDoc } = await supabase
      .from("fiscal_documents")
      .select("id, access_key, number, status")
      .eq("company_id", companyId)
      .eq("sale_id", saleId)
      .eq("doc_type", "nfce")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if ((latestDoc as any)?.status === "autorizada") {
      await Promise.all([
        supabase.from("sales")
          .update({ status: "autorizada", access_key: (latestDoc as any).access_key || null, number: (latestDoc as any).number || null })
          .eq("id", saleId)
          .eq("company_id", companyId),
        supabase.from("fiscal_queue")
          .update({ status: "done", processed_at: new Date().toISOString(), last_error: null })
          .eq("id", queueId),
      ]);

      return new Response(
        JSON.stringify({ success: true, skipped: true, sale_id: saleId, reason: "Documento já autorizado" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if ((latestDoc as any)?.access_key) {
      const { data: consultedData, error: consultError } = await supabase.functions.invoke("emit-nfce", {
        body: {
          action: "consult_status",
          access_key: (latestDoc as any).access_key,
          doc_type: "nfce",
          company_id: companyId,
        },
      });

      if (!consultError && consultedData?.success && consultedData?.status === "autorizada") {
        await Promise.all([
          supabase.from("sales")
            .update({ status: "autorizada", access_key: consultedData.access_key || (latestDoc as any).access_key || null, number: consultedData.number || (latestDoc as any).number || null })
            .eq("id", saleId)
            .eq("company_id", companyId),
          supabase.from("fiscal_queue")
            .update({ status: "done", processed_at: new Date().toISOString(), last_error: null })
            .eq("id", queueId),
        ]);

        return new Response(
          JSON.stringify({ success: true, skipped: true, sale_id: saleId, reason: "Documento autorizado após consulta" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const crt = (company as any)?.crt || 1;
    const isSimples = crt === 1 || crt === 2;
    const defaultCst = isSimples ? "102" : "00";
    const defaultPisCofins = isSimples ? "49" : "01"; // 🟠 CORREÇÃO #5: PIS/COFINS por regime
    const payments = (sale.payments as any[]) || [];

    // 🔴 CRÍTICO: Verificar NCM de todos os itens antes de emitir
    const itemsWithoutNcm = items.filter((item: any) => {
      const ncm = (item.products?.ncm || item.ncm || "").replace(/\D/g, "");
      return !ncm || ncm.length < 2 || ncm === "00000000";
    });
    if (itemsWithoutNcm.length > 0) {
      const names = itemsWithoutNcm.map((i: any) => i.product_name || i.name).join(", ");
      const errMsg = `Produto(s) sem NCM válido: ${names}. Cadastre o NCM antes de emitir NFC-e.`;
      await supabase.from("fiscal_queue")
        .update({ status: "error", last_error: errMsg })
        .eq("id", queueId);
      return new Response(
        JSON.stringify({ success: false, error: errMsg, sale_id: saleId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fiscalItems = items.map((item: any) => {
      const product = item.products || {};
      const discountValue = ((item.discount_percent || 0) / 100) * item.unit_price * item.quantity;
      return {
        product_id: item.product_id,
        name: item.product_name || item.name,
        ncm: product.ncm || item.ncm || "",
        cfop: product.cfop || "5102", // 🟠 CORREÇÃO #4: CFOP dinâmico do produto
        cst: (isSimples ? product.csosn : product.cst_icms) || defaultCst,
        origem: product.origem || "0",
        unit: item.unit || "UN",
        qty: item.quantity,
        unit_price: item.unit_price,
        discount: Math.round(discountValue * 100) / 100, // 🔴 CORREÇÃO #3: sempre valor absoluto
        pis_cst: product.cst_pis || defaultPisCofins,
        cofins_cst: product.cst_cofins || defaultPisCofins,
        icms_aliquota: product.aliq_icms || 0,
        mva: product.mva || undefined,
      };
    });

    // Build payments array for multi-payment support
    const fiscalPayments = payments.length > 0
      ? payments.map((p: any) => ({
          tPag: paymentMethodMap[p.method] || "99",
          vPag: p.amount || p.value || 0,
        }))
      : [{ tPag: "99", vPag: sale.total }];

    // 6️⃣ Chamar emissão fiscal
    const { data: fiscalData, error: fiscalErr } = await supabase.functions.invoke(
      "emit-nfce",
      {
        body: {
          action: "emit",
          sale_id: saleId,
          company_id: companyId,
          config_id: fiscalConfig.id,
          form: {
            nat_op: "VENDA DE MERCADORIA",
            crt,
            payments: fiscalPayments,
            payment_method: paymentMethodMap[payments[0]?.method] || "99",
            payment_value: sale.total,
            change: payments[0]?.change_amount || 0,
            items: fiscalItems,
          },
        },
      }
    );

    if (fiscalErr || !fiscalData?.success) {
      const errMsg = fiscalData?.error || fiscalErr?.message || "Falha na emissão";
      await Promise.all([
        supabase.from("fiscal_queue")
          .update({ status: "error", last_error: errMsg })
          .eq("id", queueId),
        supabase.from("sales")
          .update({ status: "pendente_fiscal" })
          .eq("id", saleId)
          .eq("company_id", companyId),
      ]);
      return new Response(
        JSON.stringify({ success: false, error: errMsg, sale_id: saleId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fiscalStatus = fiscalData?.status || "pendente";
    if (fiscalStatus !== "autorizada") {
      const pendingMsg = fiscalData?.error || "NFC-e enviada e aguardando autorização";
      await Promise.all([
        supabase.from("fiscal_queue")
          .update({ status: "pending", last_error: pendingMsg, processed_at: null })
          .eq("id", queueId),
        supabase.from("sales")
          .update({ status: "pendente_fiscal" })
          .eq("id", saleId)
          .eq("company_id", companyId),
      ]);
      return new Response(
        JSON.stringify({ success: true, pending: true, message: pendingMsg, sale_id: saleId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7️⃣ Sucesso real
    await Promise.all([
      supabase.from("sales")
        .update({ status: "autorizada", access_key: fiscalData?.access_key || null, number: fiscalData?.number || null })
        .eq("id", saleId)
        .eq("company_id", companyId),
      supabase.from("fiscal_queue")
        .update({ status: "done", processed_at: new Date().toISOString(), last_error: null })
        .eq("id", queueId),
    ]);

    return new Response(
      JSON.stringify({ success: true, sale_id: saleId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
