import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QrCode, Printer } from "lucide-react";
import { toast } from "sonner";
import { useCompany } from "@/hooks/useCompany";

interface Props {
  product: {
    name: string;
    price: number;
    category?: string;
    barcode?: string;
    sku?: string;
  };
  productId?: string;
  spec?: {
    width?: string;
    height?: string;
    depth?: string;
    materials?: string[];
    colors?: string[];
  };
}

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function EtiquetaShowroom({ product, productId, spec }: Props) {
  const { companyName } = useCompany();
  const handlePrint = () => {
    const storeName = companyName || "Nossa Loja";
    const dimensions = [spec?.width, spec?.height, spec?.depth].filter(Boolean).join(" × ");
    const materials = spec?.materials?.join(", ") || "";
    const colors = spec?.colors?.join(", ") || "";
    const parcela = product.price > 0 ? fmt(product.price / 10) : "";

    // URL do catálogo com produto específico
    const catalogUrl = `${window.location.origin}/catalogo-moveis${productId ? `?produto=${productId}` : ""}`;
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(catalogUrl)}`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etiqueta - ${product.name}</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; }
      .label { width:300px; border:2px solid #222; border-radius:12px; padding:16px; margin:10px auto; background:white; }
      .store { font-size:10px; color:#888; text-transform:uppercase; letter-spacing:2px; text-align:center; margin-bottom:8px; }
      .name { font-size:16px; font-weight:800; text-align:center; margin-bottom:4px; }
      .category { font-size:10px; color:#888; text-align:center; margin-bottom:10px; }
      .price { font-size:32px; font-weight:900; text-align:center; color:#2563eb; margin-bottom:2px; }
      .installment { font-size:12px; text-align:center; color:#666; margin-bottom:10px; }
      .specs { font-size:10px; color:#555; border-top:1px solid #eee; padding-top:8px; margin-top:8px; }
      .specs .row { display:flex; justify-content:space-between; padding:2px 0; }
      .qr-area { text-align:center; margin-top:10px; padding-top:8px; border-top:1px solid #eee; }
      .qr-area img { margin:6px auto; display:block; }
      .qr-area span { font-size:9px; color:#aaa; }
      .sku { font-size:9px; color:#aaa; text-align:center; margin-top:4px; font-family:monospace; }
      @media print { body { margin:0; } .label { border-color:#000; margin:0; } }
    </style></head><body>
    <div class="label">
      <div class="store">${storeName}</div>
      <div class="name">${product.name}</div>
      ${product.category ? `<div class="category">${product.category}</div>` : ""}
      <div class="price">${fmt(product.price)}</div>
      ${parcela ? `<div class="installment">ou 10x de ${parcela} sem juros</div>` : ""}
      <div class="specs">
        ${dimensions ? `<div class="row"><span>📐 Dimensões</span><span>${dimensions}</span></div>` : ""}
        ${materials ? `<div class="row"><span>🪵 Material</span><span>${materials}</span></div>` : ""}
        ${colors ? `<div class="row"><span>🎨 Cores</span><span>${colors}</span></div>` : ""}
      </div>
      <div class="qr-area">
        <img src="${qrImageUrl}" width="100" height="100" alt="QR Code" />
        <span>Escaneie para ver fotos e ficha técnica completa</span>
      </div>
      ${product.sku ? `<div class="sku">SKU: ${product.sku}${product.barcode ? ` | EAN: ${product.barcode}` : ""}</div>` : ""}
    </div>
    </body></html>`;

    const w = window.open("", "_blank", "width=400,height=500");
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 200); }
    toast.success("Etiqueta gerada para impressão");
  };

  return (
    <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5">
      <QrCode className="w-3.5 h-3.5" />
      Etiqueta Showroom
    </Button>
  );
}
