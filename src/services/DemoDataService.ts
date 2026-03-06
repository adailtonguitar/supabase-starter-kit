import { supabase } from "@/integrations/supabase/client";

const DEMO_SEEDED_KEY = "as_demo_seeded";

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

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItems<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export class DemoDataService {
  static isSeeded(companyId: string): boolean {
    try { return localStorage.getItem(`${DEMO_SEEDED_KEY}_${companyId}`) === "true"; } catch { return false; }
  }

  static markSeeded(companyId: string) {
    try { localStorage.setItem(`${DEMO_SEEDED_KEY}_${companyId}`, "true"); } catch {}
  }

  static async isDemoCompany(companyId: string): Promise<boolean> {
    const { data } = await supabase
      .from("companies")
      .select("is_demo")
      .eq("id", companyId)
      .maybeSingle();
    return data?.is_demo === true;
  }

  static async seedDemoData(companyId: string, userId: string): Promise<{ products: number; clients: number; sales: number }> {
    // 1) Insert products
    const productRows = DEMO_PRODUCTS.map(p => ({
      company_id: companyId,
      name: p.name,
      barcode: p.barcode,
      price: p.price,
      cost_price: p.cost,
      stock_quantity: p.stock,
      category: p.category,
      is_active: true,
      is_demo: true,
    }));

    const { data: insertedProducts, error: pErr } = await supabase
      .from("products")
      .insert(productRows as any)
      .select("id, name, price, cost_price, stock_quantity");

    if (pErr) throw new Error(`Erro ao criar produtos demo: ${pErr.message}`);

    // 2) Insert clients
    const clientRows = DEMO_CLIENTS.map(c => ({
      company_id: companyId,
      name: c.name,
      cpf_cnpj: c.cpf_cnpj,
      phone: c.phone,
      email: c.email,
      is_demo: true,
    }));

    const { error: cErr } = await supabase.from("clients").insert(clientRows as any);
    if (cErr) throw new Error(`Erro ao criar clientes demo: ${cErr.message}`);

    // 3) Generate 10 sales using the atomic RPC
    const products = insertedProducts || [];
    let salesCount = 0;
    const methods = ["dinheiro", "debito", "credito", "pix"];

    for (let i = 0; i < 10; i++) {
      const itemCount = randomInt(1, 5);
      const selectedProducts = randomItems(products, Math.min(itemCount, products.length));

      const items = selectedProducts.map(p => {
        const qty = randomInt(1, 3);
        return {
          product_id: p.id,
          product_name: p.name,
          quantity: qty,
          unit_price: Number(p.price),
          discount_percent: 0,
          subtotal: qty * Number(p.price),
        };
      });

      const subtotal = items.reduce((s, it) => s + it.subtotal, 0);
      const method = methods[randomInt(0, methods.length - 1)];

      const { data: result } = await supabase.rpc("finalize_sale_atomic", {
        p_company_id: companyId,
        p_terminal_id: "DEMO",
        p_session_id: null,
        p_items: items as any,
        p_subtotal: subtotal,
        p_discount_pct: 0,
        p_discount_val: 0,
        p_total: subtotal,
        p_payments: [{ method, amount: subtotal, approved: true }] as any,
        p_sold_by: userId,
      });

      const res = result as any;
      if (res?.success) {
        // Mark sale as demo
        await supabase.from("sales").update({ is_demo: true } as any).eq("id", res.sale_id);
        salesCount++;
      }
    }

    // Restore stock for demo sales (they shouldn't affect real stock)
    for (const p of products) {
      await supabase
        .from("products")
        .update({ stock_quantity: DEMO_PRODUCTS.find(dp => dp.name === p.name)?.stock || p.stock_quantity } as any)
        .eq("id", p.id);
    }

    DemoDataService.markSeeded(companyId);

    return { products: products.length, clients: DEMO_CLIENTS.length, sales: salesCount };
  }

  static async clearDemoData(companyId: string): Promise<void> {
    // Delete demo sales + sale_items (cascade)
    const { data: demoSales } = await supabase
      .from("sales")
      .select("id")
      .eq("company_id", companyId)
      .eq("is_demo" as any, true);

    if (demoSales && demoSales.length > 0) {
      const saleIds = demoSales.map(s => s.id);
      await supabase.from("sale_items").delete().in("sale_id", saleIds);
      await supabase.from("financial_entries").delete().in("reference", saleIds.map(String));
      await supabase.from("sales").delete().in("id", saleIds);
    }

    // Delete demo products
    await supabase.from("products").delete().eq("company_id", companyId).eq("is_demo" as any, true);

    // Delete demo clients
    await supabase.from("clients").delete().eq("company_id", companyId).eq("is_demo" as any, true);

    // Clear seeded flag
    try { localStorage.removeItem(`${DEMO_SEEDED_KEY}_${companyId}`); } catch {}
  }
}
