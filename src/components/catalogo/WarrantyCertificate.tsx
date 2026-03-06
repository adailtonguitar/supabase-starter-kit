import { useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCompany } from "@/hooks/useCompany";
import { format, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Printer, Download, ShieldCheck, Zap } from "lucide-react";

interface WarrantyCertificateProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: {
    id: string;
    created_at: string;
    customer_name?: string;
  };
  product: {
    name: string;
    sku?: string;
    serial_number?: string;
    voltage?: string;
    warranty_months?: number;
    barcode?: string;
    brand?: string;
  };
}

export function WarrantyCertificate({ open, onOpenChange, sale, product }: WarrantyCertificateProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const { companyName, cnpj, phone, addressCity, addressState } = useCompany();

  const purchaseDate = new Date(sale.created_at);
  const warrantyMonths = product.warranty_months || 12;
  const expiryDate = addMonths(purchaseDate, warrantyMonths);
  const certificateCode = `GAR-${sale.id.slice(0, 8).toUpperCase()}`;
  const qrUrl = `${window.location.origin}/portal-cliente?garantia=${sale.id}`;

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Certificado de Garantia - ${product.name}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Segoe UI', system-ui, sans-serif; padding: 40px; color: #1a1a1a; }
            .certificate { max-width: 700px; margin: 0 auto; border: 3px solid #1a1a1a; padding: 40px; position: relative; }
            .certificate::before { content: ''; position: absolute; inset: 6px; border: 1px solid #ccc; pointer-events: none; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #1a1a1a; padding-bottom: 20px; }
            .header h1 { font-size: 24px; letter-spacing: 4px; text-transform: uppercase; margin-bottom: 4px; }
            .header .company { font-size: 14px; color: #555; }
            .shield { display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 8px; }
            .shield svg { width: 28px; height: 28px; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 24px 0; }
            .info-item { padding: 12px; background: #f9f9f9; border-radius: 6px; }
            .info-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 4px; }
            .info-value { font-size: 14px; font-weight: 600; }
            .full-width { grid-column: 1 / -1; }
            .dates { display: flex; justify-content: space-between; margin: 24px 0; padding: 16px; background: #f0f7f0; border-radius: 8px; border: 1px solid #c3e6c3; }
            .date-block { text-align: center; }
            .date-label { font-size: 10px; text-transform: uppercase; color: #666; }
            .date-value { font-size: 18px; font-weight: 700; margin-top: 4px; }
            .qr-section { text-align: center; margin-top: 24px; padding-top: 20px; border-top: 1px dashed #ccc; }
            .qr-section p { font-size: 11px; color: #888; margin-top: 8px; }
            .code { font-family: monospace; font-size: 13px; color: #555; margin-top: 8px; letter-spacing: 2px; }
            .footer { text-align: center; margin-top: 30px; font-size: 11px; color: #999; }
            @media print { body { padding: 20px; } .certificate { border-width: 2px; } }
          </style>
        </head>
        <body>${content.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Certificado de Garantia Digital
          </DialogTitle>
        </DialogHeader>

        <div className="flex justify-end gap-2 mb-4">
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" /> Imprimir
          </Button>
        </div>

        {/* Certificate Content */}
        <div ref={printRef}>
          <div className="certificate" style={{ maxWidth: 700, margin: "0 auto", border: "3px solid hsl(var(--foreground))", padding: 40, position: "relative" }}>
            {/* Header */}
            <div style={{ textAlign: "center", marginBottom: 30, borderBottom: "2px solid hsl(var(--foreground))", paddingBottom: 20 }}>
              <div className="flex items-center justify-center gap-2 mb-2">
                <ShieldCheck className="w-7 h-7 text-primary" />
              </div>
              <h1 className="text-2xl font-bold tracking-[4px] uppercase text-foreground">Certificado de Garantia</h1>
              <p className="text-sm text-muted-foreground mt-1">{companyName || "Empresa"}</p>
              {cnpj && <p className="text-xs text-muted-foreground">CNPJ: {cnpj}</p>}
            </div>

            {/* Product Info Grid */}
            <div className="grid grid-cols-2 gap-3 my-6">
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Produto</p>
                <p className="text-sm font-semibold text-foreground">{product.name}</p>
              </div>
              {product.brand && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Marca</p>
                  <p className="text-sm font-semibold text-foreground">{product.brand}</p>
                </div>
              )}
              {product.serial_number && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Nº de Série</p>
                  <p className="text-sm font-semibold text-foreground font-mono">{product.serial_number}</p>
                </div>
              )}
              {product.voltage && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Voltagem</p>
                  <p className="text-sm font-semibold text-foreground flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5" /> {product.voltage}
                  </p>
                </div>
              )}
              {product.sku && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">SKU</p>
                  <p className="text-sm font-semibold text-foreground font-mono">{product.sku}</p>
                </div>
              )}
              {sale.customer_name && (
                <div className="p-3 bg-muted/50 rounded-lg col-span-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Cliente</p>
                  <p className="text-sm font-semibold text-foreground">{sale.customer_name}</p>
                </div>
              )}
            </div>

            {/* Dates */}
            <div className="flex justify-between my-6 p-4 bg-primary/5 rounded-xl border border-primary/20">
              <div className="text-center">
                <p className="text-[10px] uppercase text-muted-foreground">Data da Compra</p>
                <p className="text-lg font-bold text-foreground mt-1">
                  {format(purchaseDate, "dd/MM/yyyy", { locale: ptBR })}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[10px] uppercase text-muted-foreground">Garantia</p>
                <p className="text-lg font-bold text-primary mt-1">{warrantyMonths} meses</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] uppercase text-muted-foreground">Válido Até</p>
                <p className="text-lg font-bold text-foreground mt-1">
                  {format(expiryDate, "dd/MM/yyyy", { locale: ptBR })}
                </p>
              </div>
            </div>

            {/* QR Code */}
            <div className="text-center mt-6 pt-5 border-t border-dashed border-border">
              <QRCodeSVG value={qrUrl} size={100} level="M" />
              <p className="text-xs text-muted-foreground mt-2">Escaneie para verificar autenticidade</p>
              <p className="font-mono text-xs text-muted-foreground mt-1 tracking-[2px]">{certificateCode}</p>
            </div>

            {/* Footer */}
            <div className="text-center mt-6 text-xs text-muted-foreground">
              {addressCity && addressState && <p>{addressCity} - {addressState}</p>}
              {phone && <p>Tel: {phone}</p>}
              <p className="mt-2">Este certificado é parte integrante da nota fiscal de compra.</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
