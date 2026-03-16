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
    const pendingQuery = supabase
      .from("fiscal_queue")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (companyFilter) pendingQuery.eq("company_id", companyFilter);
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

    // 5️⃣ Buscar dados da venda e itens
    const [{ data: sale }, { data: items }] = await Promise.all([
      supabase.from("sales").select("*").eq("id", saleId).single(),
      supabase.from("sale_items").select("*").eq("sale_id", saleId),
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

    const crt = fiscalConfig.crt || 1;
    const defaultCst = crt === 1 || crt === 2 ? "102" : "00";
    const payments = (sale.payments as any[]) || [];
    const paymentMethodMap: Record<string, string> = {
      dinheiro: "01", credito: "03", debito: "04", pix: "17", voucher: "05",
    };

    const fiscalItems = items.map((item: any) => ({
      product_id: item.product_id,
      name: item.product_name || item.name,
      ncm: item.ncm || "",
      cfop: "5102",
      cst: defaultCst,
      origem: "0",
      unit: item.unit || "UN",
      qty: item.quantity,
      unit_price: item.unit_price,
      discount: ((item.discount_percent || 0) / 100) * item.unit_price * item.quantity,
      pis_cst: "49",
      cofins_cst: "49",
    }));

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

    // 7️⃣ Sucesso
    await Promise.all([
      supabase.from("sales").update({ status: "emitida" }).eq("id", saleId),
      supabase.from("fiscal_queue")
        .update({ status: "done", processed_at: new Date().toISOString() })
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
