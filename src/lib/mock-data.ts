export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  sku: string;
  ncm: string;
  unit: string;
  category: string;
  stock: number;
}
