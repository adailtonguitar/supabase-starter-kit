import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { FileText, Printer } from "lucide-react";
import { toast } from "sonner";
import { useCompany } from "@/hooks/useCompany";

interface PropostaItem {
  name: string;
  price: number;
  quantity: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ambienteName: string;
  comboName: string;
  items: PropostaItem[];
  total: number;
  discount: number;
  discountPercent: number;
  imageUrl?: string;
}

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function PropostaPDFDialog({ open, onOpenChange, ambienteName, comboName, items, total, discount, discountPercent, imageUrl }: Props) {
  const { companyName, phone } = useCompany();
  const storeName = companyName || "Nossa Loja de Móveis";
  const storePhone = phone || "";

  const handlePrint = () => {
    const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
    const today = new Date().toLocaleDateString("pt-BR");
    const validity = new Date(Date.now() + 15 * 86400000).toLocaleDateString("pt-BR");

    const itemRows = items.map((it, i) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center;color:#666">${i + 1}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;font-weight:500">${it.name}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center">${it.quantity}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right">${fmt(it.price)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${fmt(it.price * it.quantity)}</td>
      </tr>
    `).join("");

    const calcInst = (n: number) => fmt(total / n);

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Proposta - ${ambienteName}</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; color:#222; padding:0; }
      .page { max-width:800px; margin:0 auto; padding:40px; }
      .header { display:flex; justify-content:space-between; align-items:center; margin-bottom:30px; padding-bottom:20px; border-bottom:3px solid #2563eb; }
      .logo-area h1 { font-size:22px; color:#2563eb; margin-bottom:4px; }
      .logo-area p { font-size:12px; color:#888; }
      .date-area { text-align:right; font-size:12px; color:#888; }
      .date-area strong { color:#222; display:block; font-size:14px; }
      .ambiente-title { font-size:20px; font-weight:700; margin:20px 0 5px; }
      .ambiente-sub { font-size:13px; color:#666; margin-bottom:20px; }
      table { width:100%; border-collapse:collapse; margin:20px 0; }
      th { background:#f5f7fa; padding:10px 12px; text-align:left; font-size:11px; font-weight:700; text-transform:uppercase; color:#555; letter-spacing:0.5px; border-bottom:2px solid #ddd; }
      .totals { background:#f9fafb; border-radius:8px; padding:16px 20px; margin:20px 0; }
      .totals .row { display:flex; justify-content:space-between; padding:4px 0; font-size:13px; }
      .totals .row.final { font-size:20px; font-weight:700; color:#2563eb; padding-top:10px; margin-top:8px; border-top:2px solid #ddd; }
      .parcelas { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin:16px 0; }
      .parcela-box { text-align:center; border:1px solid #e5e7eb; border-radius:8px; padding:10px 8px; }
      .parcela-box .n { font-size:11px; color:#888; }
      .parcela-box .v { font-size:14px; font-weight:700; color:#2563eb; }
      .conditions { background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:16px; margin:20px 0; font-size:12px; color:#92400e; }
      .conditions h3 { font-size:13px; font-weight:700; margin-bottom:6px; }
      .footer { text-align:center; margin-top:40px; padding-top:20px; border-top:1px solid #eee; font-size:11px; color:#aaa; }
      .signature { margin-top:60px; display:flex; justify-content:space-between; }
      .sig-line { width:200px; text-align:center; }
      .sig-line hr { border:none; border-top:1px solid #333; margin-bottom:6px; }
      .sig-line span { font-size:11px; color:#888; }
      @media print { .page { padding:20px; } body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
    </style></head><body>
    <div class="page">
      <div class="header">
        <div class="logo-area">
          <h1>🪑 ${storeName}</h1>
          <p>${storePhone || "Loja de Móveis"}</p>
        </div>
        <div class="date-area">
          <strong>PROPOSTA COMERCIAL</strong>
          Data: ${today}<br>Validade: ${validity}
        </div>
      </div>

      <div class="ambiente-title">🏠 ${ambienteName}</div>
      <div class="ambiente-sub">Combo: ${comboName}</div>

      <table>
        <thead><tr>
          <th style="text-align:center;width:40px">#</th>
          <th>Produto</th>
          <th style="text-align:center;width:60px">Qtd</th>
          <th style="text-align:right;width:100px">Unit.</th>
          <th style="text-align:right;width:110px">Total</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>

      <div class="totals">
        <div class="row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
        <div class="row" style="color:#16a34a"><span>Desconto combo (${discountPercent}%)</span><span>-${fmt(discount)}</span></div>
        <div class="row final"><span>TOTAL</span><span>${fmt(total)}</span></div>
      </div>

      <h3 style="font-size:13px;margin-bottom:8px">💳 Condições de Pagamento</h3>
      <div class="parcelas">
        <div class="parcela-box"><div class="n">PIX / À vista</div><div class="v">${fmt(total * 0.93)}</div><div class="n">7% desc</div></div>
        <div class="parcela-box"><div class="n">3x sem juros</div><div class="v">${calcInst(3)}</div></div>
        <div class="parcela-box"><div class="n">6x sem juros</div><div class="v">${calcInst(6)}</div></div>
        <div class="parcela-box"><div class="n">10x sem juros</div><div class="v">${calcInst(10)}</div></div>
      </div>

      <div class="conditions">
        <h3>📋 Condições Gerais</h3>
        <ul style="padding-left:16px;line-height:1.8">
          <li>Proposta válida até <strong>${validity}</strong></li>
          <li>Prazo de entrega: consultar disponibilidade no estoque</li>
          <li>Frete: a combinar conforme endereço</li>
          <li>Montagem inclusa para compras acima de R$ 3.000</li>
          <li>Garantia conforme especificação de cada produto</li>
        </ul>
      </div>

      <div class="signature">
        <div class="sig-line"><hr /><span>Vendedor</span></div>
        <div class="sig-line"><hr /><span>Cliente</span></div>
      </div>

      <div class="footer">
        ${storeName} — Documento gerado em ${today} | Proposta não constitui contrato
      </div>
    </div>
    </body></html>`;

    const w = window.open("", "_blank", "width=900,height=700");
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300); }
    toast.success("Proposta gerada para impressão/PDF");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Gerar Proposta
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border border-border p-3 bg-muted/20">
            <p className="text-sm font-semibold">🏠 {ambienteName}</p>
            <p className="text-xs text-muted-foreground">Combo: {comboName}</p>
          </div>

          <div className="space-y-1">
            {items.map((it, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span>{it.quantity}x {it.name}</span>
                <span className="font-semibold">{fmt(it.price * it.quantity)}</span>
              </div>
            ))}
          </div>

          <Separator />

          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Desconto ({discountPercent}%)</span>
            <span className="text-sm text-emerald-600">-{fmt(discount)}</span>
          </div>
          <div className="flex justify-between items-center text-lg font-bold">
            <span>Total</span>
            <span className="text-primary">{fmt(total)}</span>
          </div>

          <div className="rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
            <p>📄 A proposta será gerada em formato imprimível (PDF via navegador)</p>
            <p>⏰ Validade: 15 dias</p>
            <p>🏪 Loja: {storeName}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handlePrint} className="gap-2">
            <Printer className="w-4 h-4" /> Gerar Proposta PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
