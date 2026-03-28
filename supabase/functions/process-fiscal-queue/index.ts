import { corsHeaders, createServiceClient, jsonResponse, requireCompanyMembership, requireUser } from "../_shared/auth.ts";
import {
  getPrimaryPaymentMethod,
  mapPdvMethodToTPag,
  parseSalePaymentsJson,
} from "../_shared/sale-payments.ts";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseSaleItemsJsonb(raw: unknown): Array<Record<string, unknown>> {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as Array<Record<string, unknown>>;
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw) as unknown;
      return Array.isArray(p) ? (p as Array<Record<string, unknown>>) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function firstNonEmptyStr(...vals: unknown[]): string {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

function fiscalSnapshotByProductId(itemsJson: unknown): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const row of parseSaleItemsJsonb(itemsJson)) {
    const pid = String(row.product_id ?? "").trim();
    if (pid) map.set(pid, row);
  }
  return map;
}

function visibilityPendingResponse(saleId: string, queueId: string, reason: string) {
  return new Response(
    JSON.stringify({
      success: true,
      pending: true,
      sale_id: saleId,
      queue_id: queueId,
      message: reason,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

/**
 * Chama `emit-nfce` com o JWT do usuário final.
 * `supabase.functions.invoke` no client com service role costuma enviar Authorization = service role,
 * e o `emit-nfce` falha em requireUser — daí 401 / non-2xx e fila em erro.
 */
async function invokeEmitNfceWithUserJwt(
  userBearerHeader: string,
  body: Record<string, unknown>,
): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null; status: number }> {
  const base = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!base || !anon) {
    return { data: null, error: { message: "SUPABASE_URL ou SUPABASE_ANON_KEY não configurados" }, status: 0 };
  }
  const url = `${base}/functions/v1/emit-nfce`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: userBearerHeader,
      apikey: anon,
    },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  let payload: Record<string, unknown> | null = null;
  try {
    payload = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    return { data: null, error: { message: text || `Resposta inválida (HTTP ${resp.status})` }, status: resp.status };
  }
  if (!resp.ok) {
    const msg =
      (payload?.error != null ? String(payload.error) : null) ||
      (payload?.message != null ? String(payload.message) : null) ||
      text ||
      `HTTP ${resp.status}`;
    return { data: payload, error: { message: msg }, status: resp.status };
  }
  return { data: payload, error: null, status: resp.status };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Only authenticated users can trigger queue processing (prevents public abuse)
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const companyFilter = body.company_id;
    const saleFilter = body.sale_id;
    const queueFilter = body.queue_id;

    if (companyFilter) {
      const membership = await requireCompanyMembership({
        supabase: auth.supabase,
        userId: auth.userId,
        companyId: String(companyFilter),
      });
      if (!membership.ok) return membership.response;
    }

    // Service client is allowed after auth+tenant validation
    const supabase: any = createServiceClient();

    // 1️⃣ Resetar itens presos em "processing" há mais de 5 minutos
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    let stuckQuery = supabase
      .from("fiscal_queue")
      .update({ status: "pending" })
      .eq("status", "processing")
      .lt("created_at", fiveMinAgo);

    if (companyFilter) stuckQuery = stuckQuery.eq("company_id", companyFilter);
    await stuckQuery;

    // 2️⃣ Buscar próximo item
    // - Sem filtros: pega o mais antigo em pending
    // - Com queue_id/sale_id: permite também status=processing (idempotência) para não "travar" até o reset de 5 min
    const hasSpecificTarget = Boolean(queueFilter || saleFilter);
    let pendingQuery: any = supabase
      .from("fiscal_queue")
      .select("*");
    if (!hasSpecificTarget) pendingQuery = pendingQuery.eq("status", "pending");
    else pendingQuery = pendingQuery.in("status", ["pending", "processing"]);
    if (companyFilter) pendingQuery = pendingQuery.eq("company_id", companyFilter);
    if (queueFilter) pendingQuery = pendingQuery.eq("id", String(queueFilter));
    if (saleFilter) pendingQuery = pendingQuery.eq("sale_id", String(saleFilter));
    pendingQuery = pendingQuery.order("created_at", { ascending: true }).limit(1).maybeSingle();
    const { data: queueItem } = await pendingQuery;

    if (!queueItem) return jsonResponse({ success: true, message: "Nenhum item pendente" }, 200);

    const queueId = queueItem.id;
    const saleId = queueItem.sale_id;
    const companyId = queueItem.company_id;
    const attempts = (queueItem.attempts || 0) + 1;
    const MAX_RETRIES = 5;

    // Dead-letter: evita loop infinito na fila
    if (attempts > MAX_RETRIES) {
      await Promise.all([
        supabase.from("fiscal_queue")
          .update({ status: "dead_letter", last_error: `Excedeu ${MAX_RETRIES} processamentos na fila` })
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

    // 3️⃣ Marcar como processing (se já estiver processing, só atualiza attempts)
    await supabase
      .from("fiscal_queue")
      .update({ status: "processing", attempts })
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
    // Em alguns cenários (principalmente logo após finalizar a venda no PDV), pode haver delay curto
    // até a venda/itens ficarem visíveis via API. Fazemos retry curto para evitar falso negativo.
    let sale: any = null;
    let items: any[] = [];
    let lastSaleErr: any = null;
    let lastItemsErr: any = null;
    const [{ data: company }] = await Promise.all([
      supabase.from("companies").select("crt").eq("id", companyId).maybeSingle(),
    ]);

    // Backoff após commit: ao esgotar leituras, ERROR (evita pending infinito na fila).
    const visibilityBackoffMs = [500, 1000, 2000, 5000, 10000, 20000];
    const maxVisibilityReads = visibilityBackoffMs.length + 1;

    console.log(`[process-fiscal-queue] ${new Date().toISOString()} leitura venda/itens sale_id=${saleId} queue_id=${queueId} attempts=${attempts}`);

    for (let read = 0; read < maxVisibilityReads; read++) {
      const t0 = new Date().toISOString();
      const saleRes = await supabase
        .from("sales")
        .select("*")
        .eq("id", saleId)
        .maybeSingle();

      sale = saleRes.data;
      lastSaleErr = saleRes.error;

      if (sale && String((sale as any).company_id || "") !== String(companyId)) {
        await supabase.from("fiscal_queue")
          .update({ status: "error", last_error: "Venda não pertence à empresa deste processamento." })
          .eq("id", queueId);
        return new Response(
          JSON.stringify({ success: false, error: "Venda não pertence à empresa", sale_id: saleId }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const itemsStrict = await supabase
        .from("sale_items")
        .select("*, products(ncm, cfop, csosn, cst_icms, cst_pis, cst_cofins, aliq_icms, origem)")
        .eq("sale_id", saleId)
        .eq("company_id", companyId);

      items = (itemsStrict.data as any[]) || [];
      lastItemsErr = itemsStrict.error;

      if (!items.length) {
        const itemsLoose = await supabase
          .from("sale_items")
          .select("*, products(ncm, cfop, csosn, cst_icms, cst_pis, cst_cofins, aliq_icms, origem)")
          .eq("sale_id", saleId);
        items = (itemsLoose.data as any[]) || [];
        lastItemsErr = itemsLoose.error ?? lastItemsErr;
      }

      if (sale && items.length > 0) {
        console.log(
          `[process-fiscal-queue] ${t0} visibility OK sale_id=${saleId} queue_id=${queueId} read=${read + 1}/${maxVisibilityReads} items=${items.length}`,
        );
        break;
      }

      console.log(
        `[process-fiscal-queue] ${t0} visibility read ${read + 1}/${maxVisibilityReads} sale=${!!sale} items=${items.length} sale_id=${saleId} queue_id=${queueId} processor_attempt=${attempts}`,
      );

      if (read < visibilityBackoffMs.length) {
        await sleep(visibilityBackoffMs[read]);
      }
    }

    if (!sale || !items?.length) {
      const errDetail = lastSaleErr?.message || lastItemsErr?.message || "Venda ou itens não encontrados";
      const fatalMsg =
        `Venda/itens não visíveis após ${maxVisibilityReads} leituras (backoff ${visibilityBackoffMs.join(",")}ms). ${errDetail}`;
      console.error(`[process-fiscal-queue] ${new Date().toISOString()} VISIBILITY_ERROR queue=${queueId} sale=${saleId}: ${fatalMsg}`);
      await supabase.from("fiscal_queue")
        .update({ status: "error", last_error: fatalMsg })
        .eq("id", queueId);
      return new Response(
        JSON.stringify({ success: false, error: fatalMsg, sale_id: saleId, queue_id: queueId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
      const { data: consultedData, error: consultError } = await invokeEmitNfceWithUserJwt(auth.authHeader, {
        action: "consult_status",
        access_key: (latestDoc as any).access_key,
        doc_type: "nfce",
        company_id: companyId,
      });

      if (!consultError && consultedData && consultedData.success === true && consultedData.status === "autorizada") {
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
    const defaultPisCofins = isSimples ? "49" : "01";
    const saleTotal = Number((sale as any).total ?? (sale as any).total_value ?? 0);
    let paymentRows = parseSalePaymentsJson((sale as any).payments);
    if (paymentRows.length === 0) {
      const pm = (sale as any).payment_method;
      if (typeof pm === "string" && pm.trim()) {
        paymentRows = [{ method: pm.trim(), amount: saleTotal, change_amount: 0 }];
      }
    }

    const snapByPid = fiscalSnapshotByProductId((sale as any).items);

    // 🔴 CRÍTICO: Verificar NCM de todos os itens antes de emitir
    const itemsWithoutNcm = items.filter((item: any) => {
      const pid = String(item.product_id || "");
      const snap = pid ? snapByPid.get(pid) || {} : {};
      const product = item.products || {};
      const ncm = firstNonEmptyStr(product.ncm, snap.ncm, item.ncm).replace(/\D/g, "");
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
      const pid = String(item.product_id || "");
      const snap = pid ? snapByPid.get(pid) || {} : {};
      const discountValue = ((item.discount_percent || 0) / 100) * item.unit_price * item.quantity;
      const cstProd = isSimples ? product.csosn : product.cst_icms;
      const cstSnap = isSimples ? snap.csosn : snap.cst_icms;
      const origStr = firstNonEmptyStr(
        product.origem != null ? String(product.origem) : "",
        product.origin != null ? String(product.origin) : "",
        snap.origem != null ? String(snap.origem) : "",
        snap.origin != null ? String(snap.origin) : "",
      ) || "0";
      return {
        product_id: item.product_id,
        name: item.product_name || item.name,
        ncm: firstNonEmptyStr(product.ncm, snap.ncm, item.ncm),
        cfop: firstNonEmptyStr(product.cfop, snap.cfop) || "5102",
        cst: firstNonEmptyStr(cstProd, cstSnap) || defaultCst,
        origem: origStr,
        unit: item.unit || "UN",
        qty: item.quantity,
        unit_price: item.unit_price,
        discount: Math.round(discountValue * 100) / 100, // 🔴 CORREÇÃO #3: sempre valor absoluto
        pis_cst: firstNonEmptyStr(product.cst_pis, snap.cst_pis) || defaultPisCofins,
        cofins_cst: firstNonEmptyStr(product.cst_cofins, snap.cst_cofins) || defaultPisCofins,
        icms_aliquota: Number(product.aliq_icms ?? snap.aliq_icms ?? snap.icms_rate ?? 0) || 0,
        mva: Number(product.mva) || Number(snap.mva) || undefined,
        cest: firstNonEmptyStr(product.cest, snap.cest) || undefined,
      };
    });

    const primary = paymentRows[0] as Record<string, unknown> | undefined;
    const mainPayTpag = mapPdvMethodToTPag(getPrimaryPaymentMethod(primary));
    const fiscalPayments = paymentRows.length > 0
      ? paymentRows.map((row: Record<string, unknown>) => {
        const m = getPrimaryPaymentMethod(row);
        const amt = Number(row.amount ?? row.value ?? saleTotal);
        return {
          tPag: mapPdvMethodToTPag(m),
          vPag: Math.round((Number.isFinite(amt) ? amt : saleTotal) * 100) / 100,
        };
      })
      : [{ tPag: mainPayTpag !== "99" ? mainPayTpag : "01", vPag: Math.round(saleTotal * 100) / 100 }];

    // 6️⃣ Chamar emissão fiscal (fetch + JWT do usuário — ver doc em invokeEmitNfceWithUserJwt)
    const { data: fiscalData, error: fiscalErr, status: emitHttpStatus } = await invokeEmitNfceWithUserJwt(auth.authHeader, {
      action: "emit",
      sale_id: saleId,
      company_id: companyId,
      config_id: fiscalConfig.id,
      form: {
        nat_op: "VENDA DE MERCADORIA",
        crt,
        payments: fiscalPayments,
        payment_method: mainPayTpag,
        payment_value: saleTotal,
        change: Number(primary?.change_amount ?? primary?.changeAmount ?? 0) || 0,
        items: fiscalItems,
      },
    });

    const rateLimited =
      emitHttpStatus === 429 ||
      String(fiscalErr?.message || fiscalData?.error || "").toLowerCase().includes("limite de emissões");
    if (rateLimited) {
      const pendingMsg =
        "Limite de emissões neste minuto (tente de novo em instantes ou aguarde o reprocessamento automático da fila).";
      console.log(
        `[process-fiscal-queue] ${new Date().toISOString()} rate_limited sale_id=${saleId} queue_id=${queueId} attempts=${attempts}`,
      );
      if (attempts >= MAX_RETRIES) {
        await supabase.from("fiscal_queue")
          .update({ status: "error", last_error: pendingMsg })
          .eq("id", queueId);
        return new Response(
          JSON.stringify({ success: false, error: pendingMsg, sale_id: saleId, queue_id: queueId }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      await Promise.all([
        supabase.from("fiscal_queue")
          .update({ status: "pending", last_error: pendingMsg, processed_at: null })
          .eq("id", queueId),
        supabase.from("sales")
          .update({ status: "pendente_fiscal" })
          .eq("id", saleId)
          .eq("company_id", companyId),
      ]);
      return visibilityPendingResponse(saleId, queueId, pendingMsg);
    }

    if (fiscalErr || !fiscalData?.success) {
      const errMsg =
        (fiscalData?.error != null ? String(fiscalData.error) : null) ||
        fiscalErr?.message ||
        "Falha na emissão";
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
      const pendingMsg = String(fiscalData?.error || "NFC-e enviada e aguardando autorização");
      console.log(`[process-fiscal-queue] provider pending: sale_id=${saleId}, queue_id=${queueId}, attempts=${attempts}, reason=${pendingMsg}`);
      await Promise.all([
        supabase.from("fiscal_queue")
          .update({ status: "pending", last_error: pendingMsg, processed_at: null })
          .eq("id", queueId),
        supabase.from("sales")
          .update({ status: "pendente_fiscal" })
          .eq("id", saleId)
          .eq("company_id", companyId),
      ]);
      return visibilityPendingResponse(saleId, queueId, pendingMsg);
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
