interface LowStockAlertProps {
  products: Array<{ id: string; name: string; stock_quantity: number; min_stock?: number }>;
}

export function LowStockAlert({ products }: LowStockAlertProps) {
  const lowStock = products.filter(p => p.min_stock != null && p.min_stock > 0 && p.stock_quantity <= p.min_stock);
  if (lowStock.length === 0) return null;
  
  return (
    <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3">
      <p className="text-sm font-medium text-warning">
        ⚠️ {lowStock.length} {lowStock.length === 1 ? "produto com estoque baixo" : "produtos com estoque baixo"}
      </p>
    </div>
  );
}
