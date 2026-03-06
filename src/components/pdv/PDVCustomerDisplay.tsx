import { useState, useEffect, useRef, useCallback } from "react";
import { formatCurrency } from "@/lib/utils";

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  unit: string;
}

interface CustomerDisplayData {
  items: CartItem[];
  total: number;
  subtotal: number;
  globalDiscountPercent: number;
  globalDiscountValue: number;
  itemDiscounts: Record<string, number>;
  companyName: string;
  logoUrl: string | null;
  lastAdded?: { name: string; price: number } | null;
}

const CHANNEL_KEY = "pdv_customer_display";

/**
 * Hook to broadcast cart data to the customer display window
 */
export function useCustomerDisplay() {
  const windowRef = useRef<Window | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    channelRef.current = new BroadcastChannel(CHANNEL_KEY);
    return () => channelRef.current?.close();
  }, []);

  const openDisplay = useCallback(() => {
    if (windowRef.current && !windowRef.current.closed) {
      windowRef.current.focus();
      return;
    }
    windowRef.current = window.open(
      "/pdv-display",
      "pdv_customer_display",
      "width=1024,height=768,menubar=no,toolbar=no,location=no,status=no"
    );
  }, []);

  const broadcast = useCallback((data: CustomerDisplayData) => {
    channelRef.current?.postMessage(data);
  }, []);

  return { openDisplay, broadcast };
}

/**
 * Customer Display page component — rendered in a separate window
 */
export function PDVCustomerDisplayPage() {
  const channelRef = useRef<BroadcastChannel | null>(null);
  const [connected, setConnected] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dataRef = useRef<CustomerDisplayData | null>(null);

  useEffect(() => {
    channelRef.current = new BroadcastChannel(CHANNEL_KEY);
    channelRef.current.onmessage = (e) => {
      dataRef.current = e.data;
      setConnected(true);
      renderDisplay();
    };
    return () => channelRef.current?.close();
  }, []);

  const renderDisplay = () => {
    const el = containerRef.current;
    const d = dataRef.current;
    if (!el || !d) return;

    const itemsHtml = d.items.map((item, idx) => {
      const disc = d.itemDiscounts[item.id] || 0;
      const unitP = item.price * (1 - disc / 100);
      const sub = unitP * item.quantity;
      return `
        <tr class="${idx === d.items.length - 1 ? 'last-item' : ''}">
          <td class="name">${item.name}</td>
          <td class="qty">${item.quantity}</td>
          <td class="price">${formatCurrency(unitP)}</td>
          <td class="subtotal">${formatCurrency(sub)}</td>
        </tr>
      `;
    }).join("");

    const lastAddedHtml = d.lastAdded ? `
      <div class="last-added">
        <span class="la-label">ÚLTIMO ITEM</span>
        <span class="la-name">${d.lastAdded.name}</span>
        <span class="la-price">${formatCurrency(d.lastAdded.price)}</span>
      </div>
    ` : "";

    el.innerHTML = `
      <div class="cd-container">
        <div class="cd-header">
          ${d.logoUrl ? `<img src="${d.logoUrl}" alt="Logo" class="cd-logo" />` : ""}
          <h1 class="cd-company">${d.companyName || "PDV"}</h1>
        </div>
        ${lastAddedHtml}
        <div class="cd-items">
          <table>
            <thead><tr><th>Produto</th><th>Qtd</th><th>Unit.</th><th>Subtotal</th></tr></thead>
            <tbody>${itemsHtml || '<tr><td colspan="4" class="empty">Aguardando itens...</td></tr>'}</tbody>
          </table>
        </div>
        <div class="cd-footer">
          ${d.globalDiscountPercent > 0 ? `<div class="cd-discount">Desconto: -${formatCurrency(d.globalDiscountValue)} (${d.globalDiscountPercent}%)</div>` : ""}
          <div class="cd-total">
            <span class="cd-total-label">TOTAL</span>
            <span class="cd-total-value">${formatCurrency(d.total)}</span>
          </div>
        </div>
      </div>
    `;
  };

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #0a0a0a; color: #fff; font-family: 'Inter', system-ui, sans-serif; overflow: hidden; }
        .cd-container { display: flex; flex-direction: column; height: 100vh; padding: 24px; }
        .cd-header { display: flex; align-items: center; gap: 16px; padding-bottom: 20px; border-bottom: 2px solid #333; }
        .cd-logo { height: 60px; object-fit: contain; }
        .cd-company { font-size: 28px; font-weight: 900; letter-spacing: 0.05em; }
        .last-added { background: linear-gradient(135deg, #16a34a22, #16a34a11); border: 1px solid #16a34a44; border-radius: 12px; padding: 12px 20px; margin-top: 16px; display: flex; align-items: center; gap: 16px; animation: fadeIn 0.3s; }
        .la-label { font-size: 10px; font-weight: 900; letter-spacing: 0.2em; color: #16a34a; text-transform: uppercase; }
        .la-name { flex: 1; font-size: 18px; font-weight: 700; }
        .la-price { font-size: 24px; font-weight: 900; font-family: monospace; color: #16a34a; }
        .cd-items { flex: 1; overflow-y: auto; margin-top: 16px; }
        table { width: 100%; border-collapse: collapse; }
        thead th { text-align: left; font-size: 11px; font-weight: 900; letter-spacing: 0.15em; text-transform: uppercase; color: #888; padding: 8px 12px; border-bottom: 1px solid #333; }
        thead th:nth-child(2), thead th:nth-child(3), thead th:nth-child(4) { text-align: right; }
        tbody td { padding: 10px 12px; border-bottom: 1px solid #1a1a1a; font-size: 16px; }
        tbody td.name { font-weight: 600; }
        tbody td.qty, tbody td.price, tbody td.subtotal { text-align: right; font-family: monospace; font-weight: 700; }
        tbody td.subtotal { color: #22c55e; }
        tbody td.empty { text-align: center; padding: 60px; color: #555; font-size: 18px; }
        tr.last-item { background: #16a34a11; }
        .cd-footer { border-top: 3px solid #16a34a; padding-top: 20px; margin-top: auto; }
        .cd-discount { text-align: right; font-size: 14px; color: #f97316; font-weight: 700; margin-bottom: 8px; }
        .cd-total { display: flex; justify-content: space-between; align-items: center; }
        .cd-total-label { font-size: 16px; font-weight: 900; letter-spacing: 0.3em; text-transform: uppercase; color: #aaa; }
        .cd-total-value { font-size: 56px; font-weight: 900; font-family: monospace; color: #22c55e; text-shadow: 0 0 30px #22c55e44; }
        .waiting { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; gap: 24px; }
        .waiting-icon { width: 80px; height: 80px; border: 3px solid #333; border-top-color: #22c55e; border-radius: 50%; animation: spin 1s linear infinite; }
        .waiting-text { font-size: 20px; font-weight: 700; color: #888; letter-spacing: 0.1em; }
        .waiting-sub { font-size: 14px; color: #555; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
      {!connected && (
        <div className="waiting">
          <div className="waiting-icon" />
          <div className="waiting-text">Visor do Cliente</div>
          <div className="waiting-sub">Aguardando conexão com o PDV...</div>
          <div className="waiting-sub" style={{ marginTop: 8, fontSize: 12, color: '#444' }}>
            Abra esta tela no monitor voltado para o cliente
          </div>
        </div>
      )}
      <div ref={containerRef} />
    </>
  );
}
