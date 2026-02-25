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
    // 1️⃣ Buscar registro pendente
    const { data: queueItem } = await supabase
      .from("fiscal_queue")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!queueItem) {
      return new Response(
        JSON.stringify({ message: "Nenhum item pendente" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const queueId = queueItem.id;
    const saleId = queueItem.sale_id;
    const companyId = queueItem.company_id;

    // 2️⃣ Marcar como processing
    await supabase
      .from("fiscal_queue")
      .update({
        status: "processing",
        attempts: (queueItem.attempts || 0) + 1,
      })
      .eq("id", queueId);

    // 3️⃣ Buscar dados da venda e itens
    const [{ data: sale }, { data: items }] = await Promise.all([
      supabase.from("sales").select("*").eq("id", saleId).single(),
      supabase.from("sale_items").select("*").eq("sale_id", saleId),
    ]);

    if (!sale || !items?.length) {
      throw new Error("Venda ou itens não encontrados");
    }

    // 4️⃣ Buscar config fiscal
    const { data: fiscalConfig } = await supabase
      .from("fiscal_configs")
      .select("id, crt")
      .eq("company_id", companyId)
      .eq("doc_type", "nfce")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (!fiscalConfig) {
      throw new Error("Nenhuma configuração fiscal ativa");
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

    // 5️⃣ Chamar emissão fiscal
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
      throw new Error(fiscalData?.error || fiscalErr?.message || "Falha na emissão");
    }

    // 6️⃣ Sucesso
    await Promise.all([
      supabase.from("sales").update({ status: "emitida" }).eq("id", saleId),
      supabase
        .from("fiscal_queue")
        .update({ status: "done", processed_at: new Date().toISOString() })
        .eq("id", queueId),
    ]);

    return new Response(
      JSON.stringify({ success: true, sale_id: saleId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    // Atualizar fila com erro
    try {
      const body = await req.clone().json().catch(() => ({}));
      const queueId = body?.queue_id;
      const saleId = body?.sale_id;

      if (queueId) {
        await supabase
          .from("fiscal_queue")
          .update({ status: "error", last_error: err.message })
          .eq("id", queueId);
      }
      if (saleId) {
        await supabase.from("sales").update({ status: "pendente_fiscal" }).eq("id", saleId);
      }
    } catch { /* best effort */ }

    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
