import { corsHeaders, createServiceClient, jsonResponse, requireCompanyMembership, requireUser } from "../_shared/auth.ts";
import {
  getPrimaryPaymentMethod,
  mapPdvMethodToTPag,
  parseSalePaymentsJson,
} from "../_shared/sale-payments.ts";

// ── helpers ────────────────────────────────────────────────────
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

// ── Classificação de erro: SEFAZ (permanente) vs técnico (retry) ──
const SEFAZ_REJECTION_PATTERNS = [
  /rejeic[aã]o/i,
  /cStat[:\s]*[2-9]\d{2}/i,       // códigos SEFAZ 200+ (exceto 100=autorizada)
  /ncm.*inv[aá]lid/i,
  /cfop.*inv[aá]lid/i,
  /cnpj.*inv[aá]lid/i,
  /cpf.*inv[aá]lid/i,
  /ie.*inv[aá]lid/i,
  /duplicidade/i,
  /nfc-?e.*j[aá].*autorizada/i,
  /sem ncm/i,
  /produto.*sem.*cadastro/i,
];

function isSefazPermanentError(msg: string): boolean {
  return SEFAZ_REJECTION_PATTERNS.some((re) => re.test(msg));
}

// ── Backoff progressivo: itens recentes demais são pulados ──
function shouldBackoff(attempts: number, createdAt: string): boolean {
  // attempt 1 → 0s (processa imediato), 2 → 30s, 3 → 60s, 4 → 120s, 5+ → 180s
  const backoffSeconds = [0, 0, 30, 60, 120, 180][Math.min(attempts, 5)];
  if (backoffSeconds === 0) return false;
  const createdMs = new Date(createdAt).getTime();
  const elapsed = (Date.now() - createdMs) / 1000;
  // Usa o tempo desde a criação como proxy; para retries, o updated_at seria melhor
  // mas created_at é suficiente para evitar loops rápidos
  return elapsed < backoffSeconds;
}

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

// ── Resultado de processamento individual ──
type ItemResult = { queueId: string; saleId: string; outcome: "done" | "pending" | "error" | "dead_letter" | "skipped_backoff"; detail?: string };

const BATCH_SIZE = 10;
const MAX_RETRIES = 10;

// ── Processar um único item da fila ──
async function processOneItem(
  supabase: any,
  queueItem: any,
  authHeader: string,
  isServiceCall: boolean,
  serviceRoleKey: string,
): Promise<ItemResult> {
  const queueId = queueItem.id;
  const saleId = queueItem.sale_id;
  const companyId = queueItem.company_id;
  const attempts = (queueItem.attempts || 0) + 1;

  // Backoff progressivo
  if (shouldBackoff(attempts, queueItem.updated_at || queueItem.created_at)) {
    return { queueId, saleId, outcome: "skipped_backoff", detail: `attempt=${attempts}, aguardando backoff` };
  }

  // Dead-letter
  if (attempts > MAX_RETRIES) {
    await Promise.all([
      supabase.from("fiscal_queue")
        .update({ status: "dead_letter", last_error: `Excedeu ${MAX_RETRIES} tentativas` })
        .eq("id", queueId),
      supabase.from("sales")
        .update({ status: "erro_fiscal" })
        .eq("id", saleId)
        .eq("company_id", companyId),
    ]);
    return { queueId, saleId, outcome: "dead_letter" };
  }

  // Marcar como processing
  await supabase.from("fiscal_queue")
    .update({ status: "processing", attempts, updated_at: new Date().toISOString() })
    .eq("id", queueId);

  // Config fiscal
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
    return { queueId, saleId, outcome: "error", detail: reason };
  }

  // Buscar venda + itens
  const [{ data: company }, saleRes] = await Promise.all([
    supabase.from("companies").select("crt").eq("id", companyId).maybeSingle(),
    supabase.from("sales").select("*").eq("id", saleId).maybeSingle(),
  ]);

  const sale = saleRes.data;

  if (sale && String((sale as any).company_id || "") !== String(companyId)) {
    await supabase.from("fiscal_queue")
      .update({ status: "error", last_error: "Venda não pertence à empresa" })
      .eq("id", queueId);
    return { queueId, saleId, outcome: "error", detail: "Venda não pertence à empresa" };
  }

  let items: any[] = [];
  if (sale) {
    const itemsRes = await supabase
      .from("sale_items")
      .select("*, products(ncm, cfop, csosn, cst_icms, cst_pis, cst_cofins, aliq_icms, origem)")
      .eq("sale_id", saleId)
      .eq("company_id", companyId);
    items = (itemsRes.data as any[]) || [];

    if (!items.length) {
      const itemsLoose = await supabase
        .from("sale_items")
        .select("*, products(ncm, cfop, csosn, cst_icms, cst_pis, cst_cofins, aliq_icms, origem)")
        .eq("sale_id", saleId);
      items = (itemsLoose.data as any[]) || [];
    }
  }

  if (!sale || !items.length) {
    const pendingMsg = !sale
      ? "Venda ainda não visível. Aguardando consistência."
      : "Itens da venda ainda não visíveis. Aguardando consistência.";
    await Promise.all([
      supabase.from("fiscal_queue")
        .update({ status: "pending", last_error: pendingMsg, processed_at: null })
        .eq("id", queueId),
      supabase.from("sales")
        .update({ status: "pendente_fiscal" })
        .eq("id", saleId)
        .eq("company_id", companyId),
    ]);
    return { queueId, saleId, outcome: "pending", detail: pendingMsg };
  }

  // Checar se já autorizada
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
    return { queueId, saleId, outcome: "done", detail: "Já autorizada" };
  }

  // Consultar status se já tem access_key
  if ((latestDoc as any)?.access_key) {
    const effectiveAuth = isServiceCall ? `Bearer ${serviceRoleKey}` : authHeader;
    const { data: consultedData, error: consultError } = await invokeEmitNfceWithUserJwt(effectiveAuth, {
      action: "consult_status",
      access_key: (latestDoc as any).access_key,
      doc_type: "nfce",
      company_id: companyId,
    });

    if (!consultError && consultedData?.success === true && consultedData.status === "autorizada") {
      await Promise.all([
        supabase.from("sales")
          .update({ status: "autorizada", access_key: consultedData.access_key || (latestDoc as any).access_key || null, number: consultedData.number || (latestDoc as any).number || null })
          .eq("id", saleId)
          .eq("company_id", companyId),
        supabase.from("fiscal_queue")
          .update({ status: "done", processed_at: new Date().toISOString(), last_error: null })
          .eq("id", queueId),
      ]);
      return { queueId, saleId, outcome: "done", detail: "Autorizada após consulta" };
    }
  }

  // Montar dados fiscais
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

  // Validar NCM
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
    // Erro de dados = permanente, não faz retry
    await supabase.from("fiscal_queue")
      .update({ status: "error", last_error: errMsg })
      .eq("id", queueId);
    return { queueId, saleId, outcome: "error", detail: errMsg };
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
      discount: Math.round(discountValue * 100) / 100,
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

  // Emitir
  const effectiveAuth = isServiceCall ? `Bearer ${serviceRoleKey}` : authHeader;
  const { data: fiscalData, error: fiscalErr, status: emitHttpStatus } = await invokeEmitNfceWithUserJwt(effectiveAuth, {
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

  // Rate limited
  const rateLimited =
    emitHttpStatus === 429 ||
    String(fiscalErr?.message || fiscalData?.error || "").toLowerCase().includes("limite de emissões");
  if (rateLimited) {
    const pendingMsg = "Limite de emissões atingido, aguardando reprocessamento automático.";
    await Promise.all([
      supabase.from("fiscal_queue")
        .update({ status: "pending", last_error: pendingMsg, processed_at: null })
        .eq("id", queueId),
      supabase.from("sales")
        .update({ status: "pendente_fiscal" })
        .eq("id", saleId)
        .eq("company_id", companyId),
    ]);
    return { queueId, saleId, outcome: "pending", detail: pendingMsg };
  }

  // Erro na emissão
  if (fiscalErr || !fiscalData?.success) {
    const errMsg =
      (fiscalData?.error != null ? String(fiscalData.error) : null) ||
      fiscalErr?.message ||
      "Falha na emissão";

    // ── Diferenciar erro SEFAZ permanente vs erro técnico ──
    if (isSefazPermanentError(errMsg)) {
      // Erro SEFAZ = permanente, não retry
      await Promise.all([
        supabase.from("fiscal_queue")
          .update({ status: "error", last_error: `[SEFAZ] ${errMsg}` })
          .eq("id", queueId),
        supabase.from("sales")
          .update({ status: "erro_fiscal" })
          .eq("id", saleId)
          .eq("company_id", companyId),
      ]);
      return { queueId, saleId, outcome: "error", detail: `[SEFAZ permanente] ${errMsg}` };
    }

    // Erro técnico = volta para pending para retry
    if (attempts < MAX_RETRIES) {
      await Promise.all([
        supabase.from("fiscal_queue")
          .update({ status: "pending", last_error: `[técnico] ${errMsg}`, processed_at: null })
          .eq("id", queueId),
        supabase.from("sales")
          .update({ status: "pendente_fiscal" })
          .eq("id", saleId)
          .eq("company_id", companyId),
      ]);
      return { queueId, saleId, outcome: "pending", detail: `[técnico retry] ${errMsg}` };
    }

    // Esgotou retries
    await Promise.all([
      supabase.from("fiscal_queue")
        .update({ status: "error", last_error: errMsg })
        .eq("id", queueId),
      supabase.from("sales")
        .update({ status: "erro_fiscal" })
        .eq("id", saleId)
        .eq("company_id", companyId),
    ]);
    return { queueId, saleId, outcome: "error", detail: errMsg };
  }

  // Pendente no provedor
  const fiscalStatus = fiscalData?.status || "pendente";
  if (fiscalStatus !== "autorizada") {
    const pendingMsg = String(fiscalData?.error || "NFC-e enviada, aguardando autorização");
    await Promise.all([
      supabase.from("fiscal_queue")
        .update({ status: "pending", last_error: pendingMsg, processed_at: null })
        .eq("id", queueId),
      supabase.from("sales")
        .update({ status: "pendente_fiscal" })
        .eq("id", saleId)
        .eq("company_id", companyId),
    ]);
    return { queueId, saleId, outcome: "pending", detail: pendingMsg };
  }

  // ✅ Sucesso
  await Promise.all([
    supabase.from("sales")
      .update({ status: "autorizada", access_key: fiscalData?.access_key || null, number: fiscalData?.number || null })
      .eq("id", saleId)
      .eq("company_id", companyId),
    supabase.from("fiscal_queue")
      .update({ status: "done", processed_at: new Date().toISOString(), last_error: null })
      .eq("id", queueId),
  ]);
  return { queueId, saleId, outcome: "done", detail: "Autorizada" };
}

// ══════════════════════════════════════════════════════════════
// ── HANDLER PRINCIPAL ────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const isServiceCall = token === serviceRoleKey;

    let authUserId: string | null = null;
    let authSupabase: any = null;

    if (!isServiceCall) {
      const auth = await requireUser(req);
      if (!auth.ok) return auth.response;
      authUserId = auth.userId;
      authSupabase = auth.supabase;
    }

    const body = await req.json().catch(() => ({}));
    const companyFilter = body.company_id;
    const saleFilter = body.sale_id;
    const queueFilter = body.queue_id;

    if (companyFilter && !isServiceCall && authUserId && authSupabase) {
      const membership = await requireCompanyMembership({
        supabase: authSupabase,
        userId: authUserId,
        companyId: String(companyFilter),
      });
      if (!membership.ok) return membership.response;
    }

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

    // ── Chamada específica (PDV polling por sale_id/queue_id) → item único ──
    const hasSpecificTarget = Boolean(queueFilter || saleFilter);

    if (hasSpecificTarget) {
      let pendingQuery: any = supabase.from("fiscal_queue").select("*");
      pendingQuery = pendingQuery.in("status", ["pending", "processing"]);
      if (companyFilter) pendingQuery = pendingQuery.eq("company_id", companyFilter);
      if (queueFilter) pendingQuery = pendingQuery.eq("id", String(queueFilter));
      if (saleFilter) pendingQuery = pendingQuery.eq("sale_id", String(saleFilter));
      pendingQuery = pendingQuery.order("created_at", { ascending: true }).limit(1).maybeSingle();
      const { data: queueItem } = await pendingQuery;

      if (!queueItem) return jsonResponse({ success: true, message: "Nenhum item pendente" }, 200);

      const result = await processOneItem(supabase, queueItem, authHeader, isServiceCall, serviceRoleKey);
      const success = result.outcome === "done";
      return new Response(
        JSON.stringify({
          success,
          status: result.outcome === "done" ? "autorizada" : result.outcome,
          pending: result.outcome === "pending",
          sale_id: result.saleId,
          queue_id: result.queueId,
          message: result.detail || "",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Chamada batch (cron / service) → até BATCH_SIZE itens ──
    let batchQuery: any = supabase
      .from("fiscal_queue")
      .select("*")
      .eq("status", "pending");
    if (companyFilter) batchQuery = batchQuery.eq("company_id", companyFilter);
    batchQuery = batchQuery.order("created_at", { ascending: true }).limit(BATCH_SIZE);
    const { data: queueItems } = await batchQuery;

    if (!queueItems?.length) {
      return jsonResponse({ success: true, message: "Nenhum item pendente", processed: 0 }, 200);
    }

    const results: ItemResult[] = [];
    for (const item of queueItems) {
      try {
        const r = await processOneItem(supabase, item, authHeader, isServiceCall, serviceRoleKey);
        results.push(r);
      } catch (err: any) {
        results.push({ queueId: item.id, saleId: item.sale_id, outcome: "error", detail: err.message });
        // Marcar como pending para retry na próxima execução
        await supabase.from("fiscal_queue")
          .update({ status: "pending", last_error: `[crash] ${err.message}` })
          .eq("id", item.id);
      }
    }

    const done = results.filter((r) => r.outcome === "done").length;
    const pending = results.filter((r) => r.outcome === "pending").length;
    const errors = results.filter((r) => r.outcome === "error").length;
    const deadLetter = results.filter((r) => r.outcome === "dead_letter").length;
    const skipped = results.filter((r) => r.outcome === "skipped_backoff").length;

    console.log(
      `[process-fiscal-queue] ${new Date().toISOString()} BATCH COMPLETE: ` +
      `total=${results.length}, done=${done}, pending=${pending}, errors=${errors}, dead_letter=${deadLetter}, skipped_backoff=${skipped}`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        summary: { done, pending, errors, dead_letter: deadLetter, skipped_backoff: skipped },
        details: results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error(`[process-fiscal-queue] FATAL: ${err.message}`);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
