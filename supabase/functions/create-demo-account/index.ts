import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://anthosystemcombr.lovable.app",
  "https://anthosystem.com.br",
  "https://www.anthosystem.com.br",
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

// Rate limit persistente via tabela (ver migration 20260420160000):
//   3 tentativas por IP por hora.
// O limit anterior era in-memory e resetava quando a Edge Function dormia
// — por isso alguns dias tiveram 70+ contas demo criadas do mesmo IP.
async function isRateLimitedDb(
  admin: ReturnType<typeof createClient>,
  ip: string,
  userAgent: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc("check_demo_rate_limit", {
    p_ip: ip,
    p_user_agent: userAgent,
    p_window_minutes: 60,
    p_max_attempts: 3,
  });
  if (error) {
    console.error("[rate_limit] db error, permitindo por failover:", error.message);
    return false;
  }
  return data === true;
}

// ── Demo seed data ──
const DEMO_PRODUCTS = [
  { name: "Arroz Integral 5kg", barcode: "DEMO001", price: 24.90, cost: 18.50, stock: 150, category: "Alimentos" },
  { name: "Feijão Carioca 1kg", barcode: "DEMO002", price: 8.90, cost: 5.80, stock: 200, category: "Alimentos" },
  { name: "Açúcar Cristal 5kg", barcode: "DEMO003", price: 19.90, cost: 14.00, stock: 120, category: "Alimentos" },
  { name: "Óleo de Soja 900ml", barcode: "DEMO004", price: 7.50, cost: 5.20, stock: 80, category: "Alimentos" },
  { name: "Macarrão Espaguete 500g", barcode: "DEMO005", price: 4.90, cost: 2.80, stock: 300, category: "Alimentos" },
  { name: "Leite Integral 1L", barcode: "DEMO006", price: 5.50, cost: 3.90, stock: 250, category: "Bebidas" },
  { name: "Café Torrado 500g", barcode: "DEMO007", price: 18.90, cost: 12.50, stock: 100, category: "Bebidas" },
  { name: "Refrigerante Cola 2L", barcode: "DEMO008", price: 9.90, cost: 6.00, stock: 180, category: "Bebidas" },
  { name: "Suco Natural Laranja 1L", barcode: "DEMO009", price: 12.90, cost: 8.50, stock: 60, category: "Bebidas" },
  { name: "Água Mineral 500ml", barcode: "DEMO010", price: 2.50, cost: 0.80, stock: 500, category: "Bebidas" },
  { name: "Sabonete Líquido 250ml", barcode: "DEMO011", price: 14.90, cost: 8.00, stock: 90, category: "Higiene" },
  { name: "Shampoo Neutro 400ml", barcode: "DEMO012", price: 22.90, cost: 14.00, stock: 70, category: "Higiene" },
  { name: "Papel Higiênico 12 rolos", barcode: "DEMO013", price: 19.90, cost: 12.50, stock: 100, category: "Higiene" },
  { name: "Detergente Líquido 500ml", barcode: "DEMO014", price: 3.90, cost: 1.80, stock: 200, category: "Limpeza" },
  { name: "Desinfetante 2L", barcode: "DEMO015", price: 8.90, cost: 4.50, stock: 150, category: "Limpeza" },
  { name: "Esponja de Aço 8un", barcode: "DEMO016", price: 4.50, cost: 2.00, stock: 180, category: "Limpeza" },
  { name: "Biscoito Recheado 130g", barcode: "DEMO017", price: 3.50, cost: 1.80, stock: 250, category: "Alimentos" },
  { name: "Manteiga 200g", barcode: "DEMO018", price: 11.90, cost: 8.00, stock: 80, category: "Alimentos" },
  { name: "Queijo Mussarela kg", barcode: "DEMO019", price: 42.90, cost: 32.00, stock: 40, category: "Frios" },
  { name: "Presunto Fatiado kg", barcode: "DEMO020", price: 34.90, cost: 24.00, stock: 35, category: "Frios" },
];

const DEMO_CLIENTS = [
  { name: "Maria da Silva", cpf_cnpj: "123.456.789-00", phone: "(11) 99999-1111", email: "maria@demo.com" },
  { name: "João Santos", cpf_cnpj: "234.567.890-11", phone: "(11) 99999-2222", email: "joao@demo.com" },
  { name: "Ana Oliveira", cpf_cnpj: "345.678.901-22", phone: "(11) 99999-3333", email: "ana@demo.com" },
  { name: "Carlos Pereira", cpf_cnpj: "456.789.012-33", phone: "(11) 99999-4444", email: "carlos@demo.com" },
  { name: "Empresa ABC Ltda", cpf_cnpj: "12.345.678/0001-90", phone: "(11) 99999-5555", email: "contato@empresaabc.demo.com" },
];

const DEMO_SUPPLIERS = [
  { name: "Distribuidora Brasil Alimentos", trade_name: "Brasil Alimentos", cnpj: "11.222.333/0001-44", contact_name: "Roberto Lima", email: "vendas@brasilalimentos.demo.com", phone: "(11) 3333-1111" },
  { name: "Atacado Higiene & Cia", trade_name: "Higiene & Cia", cnpj: "22.333.444/0001-55", contact_name: "Fernanda Costa", email: "compras@higieneecia.demo.com", phone: "(11) 3333-2222" },
  { name: "Bebidas Express Ltda", trade_name: "Bebidas Express", cnpj: "33.444.555/0001-66", contact_name: "Marcos Souza", email: "pedidos@bebidasexpress.demo.com", phone: "(11) 3333-3333" },
];

const DEMO_EXPENSES = [
  { description: "Aluguel do imóvel", category: "Aluguel", amount: 3500.00 },
  { description: "Conta de energia elétrica", category: "Utilidades", amount: 890.00 },
  { description: "Internet e telefone", category: "Utilidades", amount: 249.90 },
  { description: "Folha de pagamento", category: "Pessoal", amount: 5200.00 },
  { description: "Reposição de estoque — Distribuidora Brasil", category: "Fornecedores", amount: 4800.00 },
];

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItems<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(randomInt(8, 20), randomInt(0, 59), randomInt(0, 59));
  return d;
}

async function seedDemoData(adminClient: any, companyId: string, userId: string) {
  // 1) Insert products
  const productRows = DEMO_PRODUCTS.map(p => ({
    company_id: companyId,
    name: p.name,
    sku: `${p.barcode}-${companyId.slice(0, 6)}`,
    barcode: p.barcode,
    price: p.price,
    cost_price: p.cost,
    stock_quantity: p.stock,
    category: p.category,
    is_active: true,
    is_demo: true,
  }));

  const { data: insertedProducts, error: pErr } = await adminClient
    .from("products")
    .insert(productRows)
    .select("id, name, price, cost_price, stock_quantity");

  if (pErr) {
    console.error("[seed] products error:", pErr.message);
    return { products: 0, clients: 0, sales: 0, suppliers: 0, expenses: 0 };
  }

  // 2) Insert clients
  const clientRows = DEMO_CLIENTS.map(c => ({
    company_id: companyId,
    name: c.name,
    cpf_cnpj: c.cpf_cnpj,
    phone: c.phone,
    email: c.email,
    is_demo: true,
  }));

  const { error: cErr } = await adminClient.from("clients").insert(clientRows);
  if (cErr) console.error("[seed] clients error:", cErr.message);

  // 3) Insert suppliers
  const supplierRows = DEMO_SUPPLIERS.map(s => ({
    company_id: companyId,
    name: s.name,
    trade_name: s.trade_name,
    cnpj: s.cnpj,
    contact_name: s.contact_name,
    email: s.email,
    phone: s.phone,
  }));

  const { error: sErr } = await adminClient.from("suppliers").insert(supplierRows);
  if (sErr) console.warn("[seed] suppliers error (non-critical):", sErr.message);

  // 4) Generate 30 sales over the last 30 days using direct inserts (bypass RPC ambiguity)
  const products = insertedProducts || [];
  let salesCount = 0;
  const methods = ["dinheiro", "debito", "credito", "pix"];

  for (let i = 0; i < 30; i++) {
    const dayOffset = randomInt(0, 29);
    const saleDate = daysAgo(dayOffset);
    const itemCount = randomInt(1, 5);
    const selectedProducts = randomItems(products, Math.min(itemCount, products.length));

    const items = selectedProducts.map(p => {
      const qty = randomInt(1, 3);
      return {
        product_id: p.id,
        product_name: p.name,
        quantity: qty,
        unit_price: Number(p.price),
        subtotal: qty * Number(p.price),
      };
    });

    const subtotal = items.reduce((s, it) => s + it.subtotal, 0);
    const method = methods[randomInt(0, methods.length - 1)];

    // Direct insert into sales (bypass RPC ambiguity)
    const { data: sale, error: saleErr } = await adminClient
      .from("sales")
      .insert({
        company_id: companyId,
        terminal_id: "DEMO",
        subtotal,
        discount_percent: 0,
        discount_value: 0,
        total: subtotal,
        payment_method: method,
        status: "completed",
        sold_by: userId,
        is_demo: true,
        created_at: saleDate.toISOString(),
      })
      .select("id")
      .single();

    if (saleErr) {
      console.warn(`[seed] sale ${i} error:`, saleErr.message);
      continue;
    }

    // Insert sale items
    const saleItems = items.map(it => ({
      sale_id: sale.id,
      product_id: it.product_id,
      product_name: it.product_name,
      quantity: it.quantity,
      unit_price: it.unit_price,
      discount_percent: 0,
      subtotal: it.subtotal,
    }));

    await adminClient.from("sale_items").insert(saleItems);

    // Insert financial entry for the sale
    await adminClient.from("financial_entries").insert({
      company_id: companyId,
      type: "receber",
      description: `Venda #${sale.id.slice(0, 8)}`,
      amount: subtotal,
      due_date: saleDate.toISOString().split("T")[0],
      paid_date: saleDate.toISOString().split("T")[0],
      paid_amount: subtotal,
      payment_method: method,
      status: "pago",
      reference: sale.id,
      created_by: userId,
    });

    salesCount++;
  }

  // 5) Insert expense entries
  const expenseRows = DEMO_EXPENSES.map((e, idx) => {
    const expDate = daysAgo(randomInt(1, 28));
    return {
      company_id: companyId,
      type: "pagar" as const,
      description: e.description,
      category: e.category,
      amount: e.amount,
      due_date: expDate.toISOString().split("T")[0],
      paid_date: idx < 3 ? expDate.toISOString().split("T")[0] : null,
      paid_amount: idx < 3 ? e.amount : null,
      payment_method: idx < 3 ? (idx === 0 ? "pix" : "boleto") : null,
      status: idx < 3 ? "pago" : "pendente",
      created_by: userId,
    };
  });

  const { error: fErr } = await adminClient.from("financial_entries").insert(expenseRows);
  if (fErr) console.warn("[seed] expenses error (non-critical):", fErr.message);

  return { products: products.length, clients: DEMO_CLIENTS.length, sales: salesCount, suppliers: DEMO_SUPPLIERS.length, expenses: DEMO_EXPENSES.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("cf-connecting-ip")
      || "unknown";
    const userAgent = (req.headers.get("user-agent") || "unknown").slice(0, 500);

    const { company_name } = await req.json();

    if (!company_name || typeof company_name !== "string") {
      return new Response(
        JSON.stringify({ error: "company_name é obrigatório" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const safeName = company_name.trim().substring(0, 100);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Rate limit persistente (3 por IP por hora) via banco
    if (await isRateLimitedDb(supabaseAdmin, clientIp, userAgent)) {
      console.warn(`[rate_limit] bloqueado IP=${clientIp}`);
      return new Response(
        JSON.stringify({
          error: "Muitas tentativas. Você já criou 3 contas demo na última hora. Tente novamente mais tarde ou crie uma conta gratuita real."
        }),
        { status: 429, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const demoId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const email = `demo_${demoId}@demo.anthosystem.com`;
    const password = `Demo${demoId}!Ax`;

    // 1) Create user
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Usuário Demo" },
    });

    if (userError) {
      return new Response(
        JSON.stringify({ error: userError.message }),
        { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const userId = userData.user.id;

    // 2) Create demo company
    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .insert({ name: safeName, is_demo: true })
      .select("id")
      .single();

    if (companyError) {
      return new Response(
        JSON.stringify({ error: companyError.message }),
        { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // 3) Link user to company as admin
    await supabaseAdmin.from("company_users").insert({
      user_id: userId,
      company_id: company.id,
      role: "admin",
      is_active: true,
    });

    // 4) Create Pro plan with 7-day expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await supabaseAdmin.from("company_plans").insert({
      company_id: company.id,
      plan: "pro",
      status: "active",
      max_users: 0,
      fiscal_enabled: true,
      advanced_reports_enabled: true,
      financial_module_level: "full",
      expires_at: expiresAt.toISOString(),
    });

    // 5) Create profile
    try {
      await supabaseAdmin.from("profiles").upsert({
        id: userId,
        email,
        full_name: "Usuário Demo",
      });
    } catch {
      // profiles table may not exist
    }

    // 6) Auto-accept terms for demo accounts
    try {
      await supabaseAdmin.from("terms_acceptance").insert({
        company_id: company.id,
        user_id: userId,
        ip_address: clientIp,
        user_agent: "demo-account-auto",
        terms_version: "1.0",
      });
    } catch {
      // non-critical
    }

    // 7) Seed demo data (server-side, bypasses RLS)
    let seedResult = { products: 0, clients: 0, sales: 0, suppliers: 0, expenses: 0 };
    try {
      seedResult = await seedDemoData(supabaseAdmin, company.id, userId);
      console.log(`[create-demo] Seeded: ${seedResult.products}p, ${seedResult.clients}c, ${seedResult.sales}s`);
    } catch (seedErr) {
      console.error("[create-demo] Seed error:", seedErr);
    }

    console.log(`[create-demo] Demo account created: ${email} from IP: ${clientIp}`);

    return new Response(
      JSON.stringify({
        success: true,
        email,
        password,
        user_id: userId,
        company_id: company.id,
        seed: seedResult,
      }),
      { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
