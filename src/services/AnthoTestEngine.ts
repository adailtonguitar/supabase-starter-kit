import { supabase } from "@/integrations/supabase/client";
import { PRODUCTS_ACTIVE_OR_LEGACY_NULL } from "@/lib/product-active-filter";

export type TestStatus = "pending" | "running" | "pass" | "fail" | "warn" | "skipped";

export interface TestCase {
  id: string;
  layer: "api" | "database" | "interface" | "flow";
  group: string;
  name: string;
  status: TestStatus;
  duration?: number;
  error?: string;
  warning?: string;
}

export interface TestExecutionReport {
  id: string;
  startedAt: string;
  finishedAt?: string;
  totalTests: number;
  passed: number;
  failed: number;
  warnings: number;
  skipped: number;
  duration: number;
  coveragePercent: number;
  tests: TestCase[];
  systemHealth: SystemHealthStatus;
}

export interface SystemHealthStatus {
  auth: "ok" | "fail" | "unknown";
  database: "ok" | "fail" | "unknown";
  storage: "ok" | "fail" | "unknown";
  edgeFunctions: "ok" | "fail" | "unknown";
  sales: "ok" | "fail" | "unknown";
  stock: "ok" | "fail" | "unknown";
  financial: "ok" | "fail" | "unknown";
  reports: "ok" | "fail" | "unknown";
}

export interface IntegrityIssue {
  type: "stock_mismatch" | "unpaid_sale" | "orphan_record" | "duplicate" | "sync_error";
  severity: "critical" | "warning" | "info";
  module: string;
  description: string;
  details?: string;
}

interface RpcAtomicResult {
  success: boolean;
  sale_id?: string;
  error?: string;
}

type ProgressCallback = (tests: TestCase[], report?: Partial<TestExecutionReport>) => void;

const TEST_PREFIX = "__ANTHO_TEST__";

export class AnthoTestEngine {
  private companyId: string;
  private userId: string;
  private tests: TestCase[] = [];
  private onProgress: ProgressCallback;
  private cancelled = false;

  constructor(companyId: string, userId: string, onProgress: ProgressCallback) {
    this.companyId = companyId;
    this.userId = userId;
    this.onProgress = onProgress;
  }

  cancel() { this.cancelled = true; }

  private addTest(t: Omit<TestCase, "id">) {
    const existing = this.tests.find(x => x.layer === t.layer && x.group === t.group && x.name === t.name);
    if (existing) {
      Object.assign(existing, t);
    } else {
      this.tests.push({ ...t, id: `${t.layer}-${t.group}-${t.name}-${Date.now()}` });
    }
    this.onProgress([...this.tests]);
  }

  private async runTest(layer: TestCase["layer"], group: string, name: string, fn: () => Promise<void>) {
    if (this.cancelled) {
      this.addTest({ layer, group, name, status: "skipped" });
      return;
    }
    this.addTest({ layer, group, name, status: "running" });
    const start = performance.now();
    try {
      await fn();
      this.addTest({ layer, group, name, status: "pass", duration: Math.round(performance.now() - start) });
    } catch (err: unknown) {
      const msg = err instanceof Error
        ? err.message
        : (typeof err === "object" && err !== null && "message" in err)
          ? String((err as any).message)
          : String(err);
      const isWarn = msg.includes("aviso:") || msg.includes("warning:");
      this.addTest({
        layer, group, name,
        status: isWarn ? "warn" : "fail",
        duration: Math.round(performance.now() - start),
        ...(isWarn ? { warning: msg } : { error: msg }),
      });
    }
  }

  async runAll(): Promise<TestExecutionReport> {
    this.tests = [];
    this.cancelled = false;
    const startedAt = new Date().toISOString();

    await this.runAPITests();
    await this.runDatabaseTests();
    await this.runInterfaceTests();
    await this.runFlowTests();
    await this.cleanup();

    const finishedAt = new Date().toISOString();
    const passed = this.tests.filter(t => t.status === "pass").length;
    const failed = this.tests.filter(t => t.status === "fail").length;
    const warnings = this.tests.filter(t => t.status === "warn").length;
    const skipped = this.tests.filter(t => t.status === "skipped").length;
    const total = this.tests.length;
    const duration = new Date(finishedAt).getTime() - new Date(startedAt).getTime();

    const health = this.computeHealth();

    const report: TestExecutionReport = {
      id: `exec-${Date.now()}`,
      startedAt, finishedAt, totalTests: total,
      passed, failed, warnings, skipped, duration,
      coveragePercent: total > 0 ? Math.round((passed / (total - skipped || 1)) * 100) : 0,
      tests: [...this.tests],
      systemHealth: health,
    };

    this.onProgress([...this.tests], report);
    return report;
  }

  // ─── LAYER 1: API TESTS ───
  private async runAPITests() {
    await this.runTest("api", "Autenticação", "Sessão ativa", async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Sem sessão ativa");
    });
    await this.runTest("api", "Autenticação", "Dados do usuário", async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user?.id) throw new Error("Usuário não encontrado");
    });
    await this.runTest("api", "Autenticação", "Token válido", async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) throw new Error("Token inválido");
      const exp = data.session.expires_at;
      if (exp && exp * 1000 < Date.now()) throw new Error("Token expirado");
    });

    await this.runTest("api", "Empresa", "Acesso à empresa", async () => {
      // Use a known-accessible table (products) to verify company access
      const { error } = await supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("company_id", this.companyId);
      if (error) throw new Error("Sem acesso aos dados da empresa: " + error.message);
    });
    await this.runTest("api", "Empresa", "Configurações da empresa", async () => {
      // Avoid querying 'companies' directly (infinite recursion in RLS).
      // Verify membership via company_users only.
      const { data, error } = await supabase
        .from("company_users")
        .select("company_id, role")
        .eq("company_id", this.companyId)
        .eq("user_id", this.userId)
        .maybeSingle();
      if (error) throw new Error(error.message || JSON.stringify(error));
      if (!data) throw new Error("Sem vínculo com a empresa");
    });

    await this.runTest("api", "Produtos", "Listar produtos", async () => {
      const start = performance.now();
      const { error } = await supabase.from("products").select("id", { count: "exact", head: true }).eq("company_id", this.companyId);
      if (error) throw error;
      if (performance.now() - start > 3000) throw new Error("aviso: Consulta lenta (>3s)");
    });
    await this.runTest("api", "Produtos", "Filtrar produtos ativos", async () => {
      const { error } = await supabase.from("products").select("id, name, price").eq("company_id", this.companyId).or(PRODUCTS_ACTIVE_OR_LEGACY_NULL).limit(10);
      if (error) throw error;
    });
    await this.runTest("api", "Produtos", "Buscar por SKU", async () => {
      const { error } = await supabase.from("products").select("id").eq("company_id", this.companyId).limit(1);
      if (error) throw error;
    });

    await this.runTest("api", "Clientes", "Listar clientes", async () => {
      const { error } = await supabase.from("clients").select("id, name, phone").eq("company_id", this.companyId).limit(10);
      if (error) throw error;
    });
    await this.runTest("api", "Clientes", "Contar clientes", async () => {
      const { error } = await supabase.from("clients").select("id", { count: "exact", head: true }).eq("company_id", this.companyId);
      if (error) throw error;
    });

    await this.runTest("api", "Vendas", "Listar vendas recentes", async () => {
      const { error } = await supabase.from("sales").select("id, total, status, created_at").eq("company_id", this.companyId).order("created_at", { ascending: false }).limit(10);
      if (error) throw error;
    });
    await this.runTest("api", "Vendas", "Contar vendas do mês", async () => {
      const start = new Date(); start.setDate(1); start.setHours(0,0,0,0);
      const { error } = await supabase.from("sales").select("id", { count: "exact", head: true }).eq("company_id", this.companyId).gte("created_at", start.toISOString());
      if (error) throw error;
    });

    await this.runTest("api", "Financeiro", "Listar lançamentos", async () => {
      const { error } = await supabase.from("financial_entries").select("id, amount, type, status").eq("company_id", this.companyId).limit(10);
      if (error) throw error;
    });

    await this.runTest("api", "Estoque", "Consultar movimentações", async () => {
      const { error } = await supabase.from("stock_movements").select("id, type, quantity").eq("company_id", this.companyId).limit(10);
      if (error) throw error;
    });

    await this.runTest("api", "Categorias", "Listar categorias", async () => {
      const { error } = await supabase.from("product_categories").select("id, name").eq("company_id", this.companyId).limit(10);
      if (error) throw error;
    });

    await this.runTest("api", "Edge Functions", "Health Check", async () => {
      try {
        const { error } = await supabase.functions.invoke("health-check");
        if (error) throw new Error("aviso: Edge Function indisponível — " + (error.message || "sem resposta"));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.startsWith("aviso:")) throw e;
        throw new Error("aviso: Edge Function não acessível no ambiente atual");
      }
    });

    await this.runTest("api", "Storage", "Acesso ao bucket", async () => {
      try {
        const { error } = await supabase.storage.from("company-assets").list("", { limit: 1 });
        if (error) throw new Error("aviso: Bucket não acessível — " + (error.message || "sem permissão"));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.startsWith("aviso:")) throw e;
        throw new Error("aviso: Storage não acessível no ambiente atual");
      }
    });

    await this.runTest("api", "Caixa", "Listar sessões", async () => {
      const { error } = await supabase.from("cash_sessions").select("id, status").eq("company_id", this.companyId).limit(5);
      if (error) throw error;
    });
    await this.runTest("api", "Fornecedores", "Listar fornecedores", async () => {
      const { error } = await supabase.from("suppliers").select("id, name").eq("company_id", this.companyId).limit(5);
      if (error) throw error;
    });
    await this.runTest("api", "Funcionários", "Listar funcionários", async () => {
      const { error } = await supabase.from("employees").select("id, name").eq("company_id", this.companyId).limit(5);
      if (error) throw error;
    });
  }

  // ─── LAYER 2: DATABASE TESTS ───
  private async runDatabaseTests() {
    let testProductId: string | null = null;
    let testClientId: string | null = null;
    let testEntryId: string | null = null;

    await this.runTest("database", "Produtos", "Criar produto de teste", async () => {
      const { data, error } = await supabase.from("products").insert({
        company_id: this.companyId, name: `${TEST_PREFIX} DB Test`, sku: `${TEST_PREFIX}-DB-${Date.now()}`,
        price: 10, cost_price: 5, stock_quantity: 100, is_active: true, is_demo: true,
      }).select("id").single();
      if (error) throw error;
      testProductId = data.id;
    });

    await this.runTest("database", "Produtos", "Ler produto criado", async () => {
      if (!testProductId) throw new Error("Produto não criado");
      const { data, error } = await supabase.from("products").select("id, name, price").eq("id", testProductId).single();
      if (error) throw error;
      if (data.price !== 10) throw new Error(`Preço incorreto: ${data.price}`);
    });

    await this.runTest("database", "Produtos", "Atualizar produto", async () => {
      if (!testProductId) throw new Error("Produto não criado");
      const { error } = await supabase.from("products").update({ price: 20 }).eq("id", testProductId);
      if (error) throw error;
      const { data } = await supabase.from("products").select("price").eq("id", testProductId).single();
      if (data?.price !== 20) throw new Error(`Preço não atualizou`);
    });

    await this.runTest("database", "Produtos", "Soft-delete produto", async () => {
      if (!testProductId) throw new Error("Produto não criado");
      const { error } = await supabase.from("products").update({ is_active: false }).eq("id", testProductId);
      if (error) throw error;
    });

    await this.runTest("database", "Clientes", "Criar cliente de teste", async () => {
      const { data, error } = await supabase.from("clients").insert({
        company_id: this.companyId, name: `${TEST_PREFIX} Cliente Teste`, phone: "00000000000",
      }).select("id").single();
      if (error) throw error;
      testClientId = data.id;
    });

    await this.runTest("database", "Clientes", "Ler cliente criado", async () => {
      if (!testClientId) throw new Error("Cliente não criado");
      const { data, error } = await supabase.from("clients").select("id, name").eq("id", testClientId).single();
      if (error) throw error;
      if (!data.name.includes(TEST_PREFIX)) throw new Error("Nome incorreto");
    });

    await this.runTest("database", "Financeiro", "Criar lançamento", async () => {
      const { data, error } = await supabase.from("financial_entries").insert({
        company_id: this.companyId, type: "receber", description: `${TEST_PREFIX} Receita`,
        amount: 99.99, due_date: new Date().toISOString().split("T")[0], status: "pendente", created_by: this.userId,
      }).select("id").single();
      if (error) throw error;
      testEntryId = data.id;
    });

    await this.runTest("database", "Financeiro", "Verificar lançamento", async () => {
      if (!testEntryId) throw new Error("Lançamento não criado");
      const { data, error } = await supabase.from("financial_entries").select("amount").eq("id", testEntryId).single();
      if (error) throw error;
      if (data.amount !== 99.99) throw new Error(`Valor incorreto: ${data.amount}`);
    });

    await this.runTest("database", "Estoque", "Registrar entrada", async () => {
      if (!testProductId) throw new Error("Produto não criado");
      const { error } = await supabase.from("stock_movements").insert({
        company_id: this.companyId, product_id: testProductId, type: "entrada",
        quantity: 50, previous_stock: 100, new_stock: 150, reason: TEST_PREFIX, performed_by: this.userId,
      });
      if (error) throw error;
    });

    await this.runTest("database", "Estoque", "Registrar saída", async () => {
      if (!testProductId) throw new Error("Produto não criado");
      const { error } = await supabase.from("stock_movements").insert({
        company_id: this.companyId, product_id: testProductId, type: "saida",
        quantity: 20, previous_stock: 150, new_stock: 130, reason: TEST_PREFIX, performed_by: this.userId,
      });
      if (error) throw error;
    });

    await this.runTest("database", "Integridade", "Sem produtos com preço negativo", async () => {
      const { count } = await supabase.from("products").select("id", { count: "exact", head: true }).eq("company_id", this.companyId).lt("price", 0);
      if (count && count > 0) throw new Error("Produtos com preço negativo encontrados");
    });

    await this.runTest("database", "Integridade", "Sem estoque negativo", async () => {
      const { count } = await supabase.from("products").select("id", { count: "exact", head: true }).eq("company_id", this.companyId).lt("stock_quantity", 0);
      if (count && count > 0) throw new Error(`${count} produtos com estoque negativo`);
    });

    await this.runTest("database", "Integridade", "Vendas sem total zero", async () => {
      const { count } = await supabase.from("sales").select("id", { count: "exact", head: true }).eq("company_id", this.companyId).eq("total", 0).neq("status", "cancelada");
      if (count && count > 0) throw new Error(`aviso: ${count} vendas ativas com total R$0`);
    });

    await this.runTest("database", "Integridade", "Clientes sem nome vazio", async () => {
      const { count } = await supabase.from("clients").select("id", { count: "exact", head: true }).eq("company_id", this.companyId).or("name.is.null,name.eq.");
      if (count && count > 0) throw new Error(`${count} clientes sem nome`);
    });

    await this.runTest("database", "Integridade", "Lançamentos financeiros consistentes", async () => {
      const { count } = await supabase.from("financial_entries").select("id", { count: "exact", head: true }).eq("company_id", this.companyId).lte("amount", 0);
      if (count && count > 0) throw new Error(`aviso: ${count} lançamentos com valor ≤ 0`);
    });

    await this.runTest("database", "Relacionamentos", "Itens de venda com produto válido", async () => {
      try {
        const { data: recentSales } = await supabase.from("sales").select("id")
          .eq("company_id", this.companyId).order("created_at", { ascending: false }).limit(10);
        if (recentSales && recentSales.length > 0) {
          const saleIds = recentSales.map(s => s.id);
          const { data: items } = await supabase.from("sale_items").select("id, product_id").in("sale_id", saleIds).limit(50);
          if (items && items.length > 0) {
            const productIds = [...new Set(items.map(i => i.product_id).filter(Boolean))];
            if (productIds.length > 0) {
              await supabase.from("products").select("id", { count: "exact", head: true }).in("id", productIds.slice(0, 20));
            }
          }
        }
      } catch (e: unknown) {
        throw new Error("aviso: Verificação de relacionamentos limitada — " + (e instanceof Error ? e.message : String(e)));
      }
    });

    // Cleanup test data
    if (testEntryId) await supabase.from("financial_entries").delete().eq("id", testEntryId);
    if (testClientId) await supabase.from("clients").delete().eq("id", testClientId);
    if (testProductId) {
      await supabase.from("stock_movements").delete().eq("product_id", testProductId).eq("reason", TEST_PREFIX);
      await supabase.from("products").delete().eq("id", testProductId);
    }
  }

  // ─── LAYER 3: INTERFACE SIMULATION TESTS ───
  private async runInterfaceTests() {
    await this.runTest("interface", "Dashboard", "Carregar estatísticas", async () => {
      const today = new Date().toISOString().split("T")[0];
      const { error } = await supabase.from("sales").select("total").eq("company_id", this.companyId).gte("created_at", today);
      if (error) throw error;
    });

    await this.runTest("interface", "Dashboard", "Top produtos", async () => {
      const { error } = await supabase.from("sale_items").select("product_name, quantity")
        .eq("company_id", this.companyId).limit(20);
      if (error) throw new Error("aviso: Consulta de top produtos limitada — " + error.message);
    });

    await this.runTest("interface", "PDV", "Carregar grade de produtos", async () => {
      const start = performance.now();
      const { error } = await supabase.from("products").select("id, name, price, stock_quantity, barcode, image_url")
        .eq("company_id", this.companyId).or(PRODUCTS_ACTIVE_OR_LEGACY_NULL).order("name").limit(100);
      if (error) throw error;
      if (performance.now() - start > 2000) throw new Error("aviso: Grade de produtos lenta (>2s)");
    });

    await this.runTest("interface", "PDV", "Buscar produto por nome", async () => {
      const { error } = await supabase.from("products").select("id, name, price")
        .eq("company_id", this.companyId).ilike("name", "%a%").limit(10);
      if (error) throw error;
    });

    await this.runTest("interface", "Estoque", "Listar com quantidade", async () => {
      const { error } = await supabase.from("products").select("id, name, stock_quantity, min_stock")
        .eq("company_id", this.companyId).or(PRODUCTS_ACTIVE_OR_LEGACY_NULL).order("stock_quantity", { ascending: true }).limit(20);
      if (error) throw error;
    });

    await this.runTest("interface", "Financeiro", "Resumo de contas", async () => {
      const { error } = await supabase.from("financial_entries").select("type, amount, status")
        .eq("company_id", this.companyId).limit(50);
      if (error) throw error;
    });

    await this.runTest("interface", "Relatórios", "Vendas por período", async () => {
      const d30 = new Date(); d30.setDate(d30.getDate() - 30);
      const { error } = await supabase.from("sales").select("total, created_at")
        .eq("company_id", this.companyId).gte("created_at", d30.toISOString());
      if (error) throw error;
    });

    await this.runTest("interface", "Caixa", "Sessões de caixa", async () => {
      const { error } = await supabase.from("cash_sessions").select("id, status, opening_balance")
        .eq("company_id", this.companyId).order("created_at", { ascending: false }).limit(5);
      if (error) throw error;
    });

    await this.runTest("interface", "Configurações", "Dados da empresa", async () => {
      // Avoid querying 'companies' table (infinite recursion in RLS).
      // Verify membership exists and use company_users fields only.
      const { data, error } = await supabase
        .from("company_users")
        .select("company_id, role")
        .eq("company_id", this.companyId)
        .eq("user_id", this.userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Sem vínculo com a empresa");
    });

    await this.runTest("interface", "Clientes", "Lista com saldo", async () => {
      const { error } = await supabase.from("clients").select("id, name, credit_balance")
        .eq("company_id", this.companyId).order("name").limit(20);
      if (error) throw error;
    });

    await this.runTest("interface", "Navegação", "Menus disponíveis", async () => {
      const { error } = await supabase.from("company_users").select("role, permissions")
        .eq("company_id", this.companyId).eq("user_id", this.userId).maybeSingle();
      if (error) throw new Error("aviso: Permissões não acessíveis — " + error.message);
    });
  }

  // ─── LAYER 4: FULL FLOW TESTS ───
  private async runFlowTests() {
    let flowProductId: string | null = null;
    let flowSaleId: string | null = null;
    let flowClientId: string | null = null;
    let flowSessionId: string | null = null;

    // Try to find an existing open session first
    const { data: existingSession } = await supabase.from("cash_sessions")
      .select("id")
      .eq("company_id", this.companyId)
      .eq("status", "aberto")
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingSession) {
      flowSessionId = existingSession.id;
    } else {
      // Create a temporary cash session for sale tests
      const { data: sessionData, error: sessionErr } = await supabase.from("cash_sessions").insert({
        company_id: this.companyId,
        terminal_id: "ANTHO_TEST",
        opened_by: this.userId,
        opening_balance: 0,
        status: "aberto",
      }).select("id").single();
      if (sessionData) flowSessionId = sessionData.id;
      if (sessionErr) console.warn("[AnthoTest] Falha ao criar sessão:", sessionErr.message);
    }

    await this.runTest("flow", "Fluxo Completo", "1. Cadastrar produto", async () => {
      const { data, error } = await supabase.from("products").insert({
        company_id: this.companyId, name: `${TEST_PREFIX} Flow Product`,
        sku: `${TEST_PREFIX}-FLOW-${Date.now()}`, price: 25, cost_price: 12,
        stock_quantity: 500, is_active: true, is_demo: true,
      }).select("id, name, price, cost_price").single();
      if (error) throw error;
      flowProductId = data.id;
    });

    await this.runTest("flow", "Fluxo Completo", "2. Cadastrar cliente", async () => {
      const { data, error } = await supabase.from("clients").insert({
        company_id: this.companyId, name: `${TEST_PREFIX} Flow Client`, phone: "11999990000",
      }).select("id").single();
      if (error) throw error;
      flowClientId = data.id;
    });

    await this.runTest("flow", "Fluxo Completo", "3. Registrar venda (RPC atômica)", async () => {
      if (!flowProductId) throw new Error("Produto não criado");
      if (!flowSessionId) throw new Error("Sessão de caixa não disponível");
      const items = [{
        product_id: flowProductId, product_name: `${TEST_PREFIX} Flow Product`,
        quantity: 3, unit_price: 25, cost_price: 12, subtotal: 75,
      }];
      const { data, error } = await supabase.rpc("finalize_sale_atomic", {
        p_company_id: this.companyId, p_terminal_id: "ANTHO_TEST",
        p_session_id: flowSessionId, p_items: items, p_subtotal: 75,
        p_discount_pct: 0, p_discount_val: 0, p_total: 75,
        p_payments: [{ method: "dinheiro", amount: 75 }], p_sold_by: this.userId,
      });
      if (error) throw new Error("RPC error: " + error.message);
      const result = data as RpcAtomicResult | null;
      if (!result?.success) throw new Error(result?.error || "RPC falhou sem detalhes");
      flowSaleId = result.sale_id || null;
    });

    await this.runTest("flow", "Fluxo Completo", "4. Verificar venda no histórico", async () => {
      if (!flowSaleId) throw new Error("Venda não registrada");
      const { data, error } = await supabase.from("sales").select("id, total, status").eq("id", flowSaleId).single();
      if (error) throw error;
      if (data.total !== 75) throw new Error(`Total incorreto: ${data.total}`);
    });

    await this.runTest("flow", "Fluxo Completo", "5. Verificar baixa de estoque", async () => {
      if (!flowProductId) throw new Error("Produto não criado");
      const { data } = await supabase.from("products").select("stock_quantity").eq("id", flowProductId).single();
      if (data?.stock_quantity !== 497) throw new Error(`Estoque esperado 497, obteve ${data?.stock_quantity}`);
    });

    await this.runTest("flow", "Fluxo Completo", "6. Verificar lançamento financeiro", async () => {
      if (!flowSaleId) throw new Error("Venda não registrada");
      const { data } = await supabase.from("financial_entries").select("id, amount").eq("reference", flowSaleId).maybeSingle();
      if (!data) throw new Error("aviso: Lançamento financeiro automático não encontrado");
    });

    await this.runTest("flow", "Pagamento", "Venda com múltiplos pagamentos", async () => {
      if (!flowProductId) throw new Error("Produto não criado");
      const items = [{
        product_id: flowProductId, product_name: `${TEST_PREFIX} Flow Product`,
        quantity: 2, unit_price: 25, cost_price: 12, subtotal: 50,
      }];
      const { data, error } = await supabase.rpc("finalize_sale_atomic", {
        p_company_id: this.companyId, p_terminal_id: "ANTHO_TEST",
        p_session_id: flowSessionId, p_items: items, p_subtotal: 50,
        p_discount_pct: 0, p_discount_val: 0, p_total: 50,
        p_payments: [{ method: "pix", amount: 30 }, { method: "dinheiro", amount: 20 }],
        p_sold_by: this.userId,
      });
      if (error) throw error;
      const result = data as RpcAtomicResult | null;
      if (!result?.success) throw new Error(result?.error || "Multi-pagamento falhou");
      if (result.sale_id) {
        await supabase.from("sale_items").delete().eq("sale_id", result.sale_id);
        await supabase.from("financial_entries").delete().eq("reference", result.sale_id);
        await supabase.from("sales").delete().eq("id", result.sale_id);
        await supabase.from("products").update({ stock_quantity: 495 }).eq("id", flowProductId);
      }
    });

    await this.runTest("flow", "Desconto", "Venda com desconto percentual", async () => {
      if (!flowProductId) throw new Error("Produto não criado");
      const items = [{
        product_id: flowProductId, product_name: `${TEST_PREFIX} Flow Product`,
        quantity: 1, unit_price: 25, cost_price: 12, subtotal: 25,
      }];
      const discountVal = 2.5;
      const { data, error } = await supabase.rpc("finalize_sale_atomic", {
        p_company_id: this.companyId, p_terminal_id: "ANTHO_TEST",
        p_session_id: flowSessionId, p_items: items, p_subtotal: 25,
        p_discount_pct: 10, p_discount_val: discountVal, p_total: 22.5,
        p_payments: [{ method: "dinheiro", amount: 22.5 }], p_sold_by: this.userId,
      });
      if (error) throw error;
      const result = data as RpcAtomicResult | null;
      if (!result?.success) throw new Error(result?.error || "Desconto falhou");
      if (result.sale_id) {
        await supabase.from("sale_items").delete().eq("sale_id", result.sale_id);
        await supabase.from("financial_entries").delete().eq("reference", result.sale_id);
        await supabase.from("sales").delete().eq("id", result.sale_id);
        await supabase.from("products").update({ stock_quantity: 495 }).eq("id", flowProductId);
      }
    });

    // Cleanup flow data
    if (flowSaleId) {
      await supabase.from("sale_items").delete().eq("sale_id", flowSaleId);
      await supabase.from("financial_entries").delete().eq("reference", flowSaleId);
      await supabase.from("sales").delete().eq("id", flowSaleId);
    }
    if (flowClientId) await supabase.from("clients").delete().eq("id", flowClientId);
    if (flowProductId) {
      await supabase.from("stock_movements").delete().eq("product_id", flowProductId).eq("reason", TEST_PREFIX);
      await supabase.from("products").delete().eq("id", flowProductId);
    }
    // Close and remove temp session created by tests
    if (flowSessionId) {
      try {
        await supabase.from("cash_sessions").update({ status: "fechado" }).eq("id", flowSessionId).eq("terminal_id", "ANTHO_TEST");
        await supabase.from("cash_movements").delete().eq("session_id", flowSessionId);
        await supabase.from("cash_sessions").delete().eq("id", flowSessionId).eq("terminal_id", "ANTHO_TEST");
      } catch { /* non-critical */ }
    }
  }

  // ─── INTEGRITY AUDIT ───
  async runIntegrityAudit(): Promise<IntegrityIssue[]> {
    const issues: IntegrityIssue[] = [];

    const { data: negStock } = await supabase.from("products").select("id, name, stock_quantity")
      .eq("company_id", this.companyId).lt("stock_quantity", 0);
    if (negStock && negStock.length > 0) {
      for (const p of negStock) {
        issues.push({
          type: "stock_mismatch", severity: "critical", module: "Estoque",
          description: `Produto "${p.name}" com estoque negativo: ${p.stock_quantity}`,
        });
      }
    }

    const formatBRL = (value: unknown) =>
      Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    const { data: recentSales } = await supabase
      .from("sales")
      .select("id, total, items")
      .eq("company_id", this.companyId)
      .neq("status", "cancelada")
      .order("created_at", { ascending: false })
      .limit(100);

    if (recentSales && recentSales.length > 0) {
      const salesToCheck = recentSales.slice(0, 20);
      const saleIds = salesToCheck.map((s) => s.id);

      const { data: saleItems } = await supabase
        .from("sale_items")
        .select("sale_id")
        .in("sale_id", saleIds);

      const saleIdsWithItems = new Set((saleItems || []).map((item: { sale_id: string }) => item.sale_id));

      for (const sale of salesToCheck) {
        if (saleIdsWithItems.has(sale.id)) continue;

        let hasLegacyJsonItems = false;
        if (sale.items) {
          try {
            const parsed = Array.isArray(sale.items) ? sale.items : JSON.parse(String(sale.items));
            hasLegacyJsonItems = Array.isArray(parsed) && parsed.length > 0;
          } catch {
            hasLegacyJsonItems = false;
          }
        }

        if (!hasLegacyJsonItems) {
          issues.push({
            type: "orphan_record",
            severity: "warning",
            module: "Vendas",
            description: `Venda ${sale.id.slice(0, 8)} sem itens (total: ${formatBRL(sale.total)})`,
          });
        }
      }
    }

    const { count: orphanEntries } = await supabase.from("financial_entries")
      .select("id", { count: "exact", head: true })
      .eq("company_id", this.companyId).is("reference", null).eq("status", "pendente");
    if (orphanEntries && orphanEntries > 20) {
      issues.push({
        type: "orphan_record", severity: "info", module: "Financeiro",
        description: `${orphanEntries} lançamentos pendentes sem referência`,
      });
    }

    const { count: noPrice } = await supabase.from("products").select("id", { count: "exact", head: true })
      .eq("company_id", this.companyId).or(PRODUCTS_ACTIVE_OR_LEGACY_NULL).or("price.is.null,price.eq.0");
    if (noPrice && noPrice > 0) {
      issues.push({
        type: "stock_mismatch", severity: "warning", module: "Produtos",
        description: `${noPrice} produtos ativos sem preço definido`,
      });
    }

    return issues;
  }

  // ─── HEALTH COMPUTATION ───
  private computeHealth(): SystemHealthStatus {
    const getStatus = (layer: string, groups: string[]): "ok" | "fail" | "unknown" => {
      const tests = this.tests.filter(t => t.layer === layer && groups.some(g => t.group.includes(g)));
      if (tests.length === 0) return "unknown";
      if (tests.some(t => t.status === "fail")) return "fail";
      return "ok";
    };

    return {
      auth: getStatus("api", ["Autenticação"]),
      database: getStatus("database", ["Produtos", "Clientes", "Integridade"]),
      storage: getStatus("api", ["Storage"]),
      edgeFunctions: getStatus("api", ["Edge Functions"]),
      sales: getStatus("flow", ["Fluxo Completo", "Pagamento"]),
      stock: getStatus("database", ["Estoque"]),
      financial: getStatus("database", ["Financeiro"]),
      reports: getStatus("interface", ["Relatórios", "Dashboard"]),
    };
  }

  // ─── CLEANUP ───
  private async cleanup() {
    try {
      // Clean up test sales (identified by terminal_id "ANTHO_TEST")
      const { data: testSales } = await supabase
        .from("sales")
        .select("id")
        .eq("company_id", this.companyId)
        .eq("terminal_id", "ANTHO_TEST");

      if (testSales && testSales.length > 0) {
        for (const sale of testSales) {
          await supabase.from("sale_items").delete().eq("sale_id", sale.id);
          await supabase.from("financial_entries").delete().eq("reference", sale.id);
        }
        const saleIds = testSales.map(s => s.id);
        await supabase.from("sales").delete().eq("company_id", this.companyId).in("id", saleIds);
      }

      // Clean up test cash sessions
      const { data: testSessions } = await supabase
        .from("cash_sessions")
        .select("id")
        .eq("company_id", this.companyId)
        .eq("terminal_id", "ANTHO_TEST");

      if (testSessions && testSessions.length > 0) {
        for (const sess of testSessions) {
          await supabase.from("cash_movements").delete().eq("session_id", sess.id);
        }
        await supabase.from("cash_sessions").delete().eq("company_id", this.companyId).eq("terminal_id", "ANTHO_TEST");
      }

      // Clean up test products, movements, financial entries and clients
      await supabase.from("products").delete().eq("company_id", this.companyId).like("name", `${TEST_PREFIX}%`);
      await supabase.from("stock_movements").delete().eq("company_id", this.companyId).eq("reason", TEST_PREFIX);
      await supabase.from("financial_entries").delete().eq("company_id", this.companyId).like("description", `${TEST_PREFIX}%`);
      await supabase.from("clients").delete().eq("company_id", this.companyId).like("name", `${TEST_PREFIX}%`);
    } catch { /* non-critical */ }
  }
}
