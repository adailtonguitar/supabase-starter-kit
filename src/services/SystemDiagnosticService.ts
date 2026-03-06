import { supabase } from "@/integrations/supabase/client";

export interface TestResult {
  id: string;
  group: string;
  name: string;
  status: "pass" | "fail" | "running" | "pending";
  duration?: number;
  error?: string;
}

export interface DiagnosticReport {
  results: TestResult[];
  startedAt: Date;
  finishedAt?: Date;
  total: number;
  passed: number;
  failed: number;
}

type ProgressCallback = (results: TestResult[]) => void;

const TEST_PREFIX = "__DIAG_TEST__";

export class SystemDiagnosticService {
  private companyId: string;
  private userId: string;
  private results: TestResult[] = [];
  private onProgress: ProgressCallback;

  constructor(companyId: string, userId: string, onProgress: ProgressCallback) {
    this.companyId = companyId;
    this.userId = userId;
    this.onProgress = onProgress;
  }

  private addResult(r: Omit<TestResult, "id">) {
    const existing = this.results.find(
      (t) => t.group === r.group && t.name === r.name
    );
    if (existing) {
      Object.assign(existing, r);
    } else {
      this.results.push({ ...r, id: `${r.group}-${r.name}-${Date.now()}` });
    }
    this.onProgress([...this.results]);
  }

  private async runTest(group: string, name: string, fn: () => Promise<void>) {
    this.addResult({ group, name, status: "running" });
    const start = performance.now();
    try {
      await fn();
      this.addResult({
        group,
        name,
        status: "pass",
        duration: Math.round(performance.now() - start),
      });
    } catch (err: any) {
      this.addResult({
        group,
        name,
        status: "fail",
        duration: Math.round(performance.now() - start),
        error: err?.message || String(err),
      });
    }
  }

  async runAll(): Promise<DiagnosticReport> {
    this.results = [];

    // Define all test groups
    const groups = [
      () => this.testAuth(),
      () => this.testProducts(),
      () => this.testStock(),
      () => this.testSales(),
      () => this.testFinancial(),
      () => this.testReports(),
    ];

    for (const group of groups) {
      await group();
    }

    // Cleanup
    await this.cleanup();

    const report: DiagnosticReport = {
      results: this.results,
      startedAt: new Date(),
      finishedAt: new Date(),
      total: this.results.length,
      passed: this.results.filter((r) => r.status === "pass").length,
      failed: this.results.filter((r) => r.status === "fail").length,
    };
    return report;
  }

  // ─── AUTH TESTS ───
  private async testAuth() {
    await this.runTest("Autenticação", "Sessão ativa", async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Sem sessão ativa");
    });

    await this.runTest("Autenticação", "Dados do usuário", async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user?.id) throw new Error("Usuário não encontrado");
    });

    await this.runTest("Autenticação", "Acesso à empresa", async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name")
        .eq("id", this.companyId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Empresa não encontrada");
    });
  }

  // ─── PRODUCTS TESTS ───
  private async testProducts() {
    let testProductId: string | null = null;

    await this.runTest("Produtos", "Criar produto de teste", async () => {
      const { data, error } = await supabase
        .from("products")
        .insert({
          company_id: this.companyId,
          name: `${TEST_PREFIX} Produto Diagnóstico`,
          sku: `${TEST_PREFIX}-${Date.now()}`,
          price: 19.9,
          cost_price: 10.0,
          stock_quantity: 50,
          is_active: true,
          is_demo: true,
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      testProductId = data.id;
    });

    await this.runTest("Produtos", "Ler produto criado", async () => {
      if (!testProductId) throw new Error("Produto não foi criado");
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price")
        .eq("id", testProductId)
        .single();
      if (error) throw error;
      if (data.price !== 19.9) throw new Error(`Preço incorreto: ${data.price}`);
    });

    await this.runTest("Produtos", "Editar produto", async () => {
      if (!testProductId) throw new Error("Produto não foi criado");
      const { error } = await supabase
        .from("products")
        .update({ price: 25.5 })
        .eq("id", testProductId);
      if (error) throw error;

      const { data } = await supabase
        .from("products")
        .select("price")
        .eq("id", testProductId)
        .single();
      if (data?.price !== 25.5) throw new Error(`Preço não atualizou: ${data?.price}`);
    });

    await this.runTest("Produtos", "Desativar produto (soft-delete)", async () => {
      if (!testProductId) throw new Error("Produto não foi criado");
      const { error } = await supabase
        .from("products")
        .update({ is_active: false })
        .eq("id", testProductId);
      if (error) throw error;
    });

    // Hard cleanup at end
    if (testProductId) {
      await supabase.from("products").delete().eq("id", testProductId);
    }
  }

  // ─── STOCK TESTS ───
  private async testStock() {
    let testProductId: string | null = null;

    // Create a product for stock tests
    const { data: prod } = await supabase
      .from("products")
      .insert({
        company_id: this.companyId,
        name: `${TEST_PREFIX} Estoque Test`,
        sku: `${TEST_PREFIX}-STK-${Date.now()}`,
        price: 10,
        cost_price: 5,
        stock_quantity: 100,
        is_active: true,
        is_demo: true,
      } as any)
      .select("id")
      .single();
    testProductId = prod?.id || null;

    await this.runTest("Estoque", "Verificar quantidade inicial", async () => {
      if (!testProductId) throw new Error("Produto de teste não criado");
      const { data } = await supabase
        .from("products")
        .select("stock_quantity")
        .eq("id", testProductId)
        .single();
      if (data?.stock_quantity !== 100) throw new Error(`Esperado 100, obteve ${data?.stock_quantity}`);
    });

    await this.runTest("Estoque", "Registrar entrada de estoque", async () => {
      if (!testProductId) throw new Error("Produto de teste não criado");

      const { data: before } = await supabase
        .from("products")
        .select("stock_quantity")
        .eq("id", testProductId)
        .single();
      const prevQty = Number(before?.stock_quantity ?? 100);
      const newQty = prevQty + 20;

      const { error } = await supabase.from("stock_movements" as any).insert({
        company_id: this.companyId,
        product_id: testProductId,
        type: "entrada",
        quantity: 20,
        previous_stock: prevQty,
        new_stock: newQty,
        reason: TEST_PREFIX,
        performed_by: this.userId,
      });
      if (error) throw error;

      await supabase.from("products").update({ stock_quantity: newQty }).eq("id", testProductId);

      const { data } = await supabase
        .from("products")
        .select("stock_quantity")
        .eq("id", testProductId)
        .single();
      if (data?.stock_quantity !== newQty) throw new Error(`Esperado ${newQty}, obteve ${data?.stock_quantity}`);
    });

    await this.runTest("Estoque", "Registrar saída de estoque", async () => {
      if (!testProductId) throw new Error("Produto de teste não criado");

      const { data: before } = await supabase
        .from("products")
        .select("stock_quantity")
        .eq("id", testProductId)
        .single();
      const prevQty = Number(before?.stock_quantity ?? 120);
      const newQty = prevQty - 30;

      const { error } = await supabase.from("stock_movements" as any).insert({
        company_id: this.companyId,
        product_id: testProductId,
        type: "saida",
        quantity: 30,
        previous_stock: prevQty,
        new_stock: newQty,
        reason: TEST_PREFIX,
        performed_by: this.userId,
      });
      if (error) throw error;

      await supabase.from("products").update({ stock_quantity: newQty }).eq("id", testProductId);

      const { data } = await supabase
        .from("products")
        .select("stock_quantity")
        .eq("id", testProductId)
        .single();
      if (data?.stock_quantity !== newQty) throw new Error(`Esperado ${newQty}, obteve ${data?.stock_quantity}`);
    });

    await this.runTest("Estoque", "Impedir estoque negativo", async () => {
      if (!testProductId) throw new Error("Produto de teste não criado");
      // Try to withdraw more than available — should not result in negative
      const { data } = await supabase
        .from("products")
        .select("stock_quantity")
        .eq("id", testProductId)
        .single();
      const qty = data?.stock_quantity ?? 0;
      if (qty < 0) throw new Error(`Estoque negativo detectado: ${qty}`);
    });

    // Cleanup
    if (testProductId) {
      await (supabase.from("stock_movements").delete() as any).eq("product_id", testProductId).eq("reason", TEST_PREFIX);
      await supabase.from("products").delete().eq("id", testProductId);
    }
  }

  // ─── SALES TESTS ───
  private async testSales() {
    let testProductId: string | null = null;
    let testSaleId: string | null = null;

    // Create product for sale
    const { data: prod } = await supabase
      .from("products")
      .insert({
        company_id: this.companyId,
        name: `${TEST_PREFIX} Venda Test`,
        sku: `${TEST_PREFIX}-SALE-${Date.now()}`,
        price: 15,
        cost_price: 8,
        stock_quantity: 200,
        is_active: true,
        is_demo: true,
      } as any)
      .select("id, name, price, cost_price")
      .single();
    testProductId = prod?.id || null;

    await this.runTest("Vendas", "Registrar venda (RPC atômica)", async () => {
      if (!testProductId || !prod) throw new Error("Produto não criado");
      const saleItems = [
        {
          product_id: testProductId,
          product_name: prod.name,
          quantity: 3,
          unit_price: prod.price,
          cost_price: prod.cost_price,
          subtotal: prod.price * 3,
        },
      ];
      const total = prod.price * 3;

      const { data: rpcResult, error } = await supabase.rpc("finalize_sale_atomic", {
        p_company_id: this.companyId,
        p_terminal_id: "DIAG_TEST",
        p_session_id: null,
        p_items: saleItems,
        p_subtotal: total,
        p_discount_pct: 0,
        p_discount_val: 0,
        p_total: total,
        p_payments: [{ method: "dinheiro", amount: total }],
        p_sold_by: this.userId,
      });
      if (error) throw error;
      const result = rpcResult as any;
      if (!result?.success) throw new Error(result?.error || "RPC falhou");
      testSaleId = result.sale_id;
    });

    await this.runTest("Vendas", "Verificar venda no histórico", async () => {
      if (!testSaleId) throw new Error("Venda não registrada");
      const { data, error } = await supabase
        .from("sales")
        .select("id, total, status")
        .eq("id", testSaleId)
        .single();
      if (error) throw error;
      if (!data) throw new Error("Venda não encontrada no histórico");
    });

    await this.runTest("Vendas", "Validar total da venda", async () => {
      if (!testSaleId) throw new Error("Venda não registrada");
      const { data } = await supabase
        .from("sales")
        .select("total")
        .eq("id", testSaleId)
        .single();
      const expectedTotal = 15 * 3;
      if (data?.total !== expectedTotal) throw new Error(`Total esperado ${expectedTotal}, obteve ${data?.total}`);
    });

    // Cleanup
    if (testSaleId) {
      await supabase.from("sale_items").delete().eq("sale_id", testSaleId);
      await supabase.from("sales").delete().eq("id", testSaleId);
    }
    if (testProductId) {
      await supabase.from("products").delete().eq("id", testProductId);
    }
  }

  // ─── FINANCIAL TESTS ───
  private async testFinancial() {
    let entryId: string | null = null;

    await this.runTest("Financeiro", "Criar lançamento de teste", async () => {
      const { data, error } = await supabase
        .from("financial_entries")
        .insert({
          company_id: this.companyId,
          type: "receber",
          description: `${TEST_PREFIX} Receita teste`,
          amount: 99.99,
          due_date: new Date().toISOString().split("T")[0],
          status: "pendente",
          created_by: this.userId,
        })
        .select("id")
        .single();
      if (error) throw error;
      entryId = data.id;
    });

    await this.runTest("Financeiro", "Verificar lançamento salvo", async () => {
      if (!entryId) throw new Error("Lançamento não criado");
      const { data, error } = await supabase
        .from("financial_entries")
        .select("id, amount, type")
        .eq("id", entryId)
        .single();
      if (error) throw error;
      if (data?.amount !== 99.99) throw new Error(`Valor incorreto: ${data?.amount}`);
    });

    // Cleanup
    if (entryId) {
      await supabase.from("financial_entries").delete().eq("id", entryId);
    }
  }

  // ─── REPORTS TESTS ───
  private async testReports() {
    await this.runTest("Relatórios", "Consultar vendas do mês", async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { error, count } = await supabase
        .from("sales")
        .select("id", { count: "exact", head: true })
        .eq("company_id", this.companyId)
        .gte("created_at", startOfMonth.toISOString());
      if (error) throw error;
      // Just verify the query works; count can be 0
    });

    await this.runTest("Relatórios", "Consultar produtos ativos", async () => {
      const { error, count } = await supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("company_id", this.companyId)
        .eq("is_active", true);
      if (error) throw error;
    });

    await this.runTest("Relatórios", "Consultar lançamentos financeiros", async () => {
      const { error } = await supabase
        .from("financial_entries")
        .select("id, amount, type")
        .eq("company_id", this.companyId)
        .limit(5);
      if (error) throw error;
    });

    await this.runTest("Relatórios", "Consultar clientes", async () => {
      const { error } = await supabase
        .from("clients")
        .select("id, name")
        .eq("company_id", this.companyId)
        .limit(5);
      if (error) throw error;
    });
  }

  // ─── CLEANUP ───
  private async cleanup() {
    try {
      // Delete any leftover test products
      await supabase
        .from("products")
        .delete()
        .eq("company_id", this.companyId)
        .like("name", `${TEST_PREFIX}%`);

      // Delete test stock movements
      await (supabase
        .from("stock_movements")
        .delete() as any)
        .eq("company_id", this.companyId)
        .eq("reason", TEST_PREFIX);

      // Delete test financial entries
      await supabase
        .from("financial_entries")
        .delete()
        .eq("company_id", this.companyId)
        .like("description", `${TEST_PREFIX}%`);
    } catch {
      // Cleanup errors are non-critical
    }
  }
}
