import { useState, useRef } from "react";
import { Upload, FileText, AlertCircle, CheckCircle2, Loader2, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface NFeImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface NFeProduct {
  name: string;
  ncm: string;
  barcode: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  valid: boolean;
  error?: string;
}

interface NFeInfo {
  number: string;
  series: string;
  issueDate: string;
  supplierName: string;
  supplierCnpj: string;
  totalValue: number;
  products: NFeProduct[];
}

function parseNFeXML(xmlText: string): NFeInfo | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "text/xml");

    const parseError = doc.querySelector("parsererror");
    if (parseError) return null;

    // Handle namespace - try both with and without namespace
    const ns = "http://www.portalfiscal.inf.br/nfe";
    const getEl = (parent: Element | Document, tag: string): Element | null => {
      return parent.getElementsByTagNameNS(ns, tag)[0] || parent.getElementsByTagName(tag)[0] || null;
    };
    const getAll = (parent: Element | Document, tag: string): Element[] => {
      const nsResult = parent.getElementsByTagNameNS(ns, tag);
      const plainResult = parent.getElementsByTagName(tag);
      return Array.from(nsResult.length > 0 ? nsResult : plainResult);
    };
    const getText = (parent: Element | Document, tag: string): string => {
      const el = getEl(parent, tag);
      return el?.textContent?.trim() || "";
    };

    const ide = getEl(doc, "ide");
    const emit = getEl(doc, "emit");
    const total = getEl(doc, "ICMSTot") || getEl(doc, "total");

    const nfeInfo: NFeInfo = {
      number: ide ? getText(ide, "nNF") : "",
      series: ide ? getText(ide, "serie") : "",
      issueDate: ide ? getText(ide, "dhEmi").slice(0, 10) : "",
      supplierName: emit ? getText(emit, "xNome") : "",
      supplierCnpj: emit ? getText(emit, "CNPJ") : "",
      totalValue: total ? parseFloat(getText(total, "vNF")) || 0 : 0,
      products: [],
    };

    const dets = getAll(doc, "det");
    for (const det of dets) {
      const prod = getEl(det, "prod");
      if (!prod) continue;

      const name = getText(prod, "xProd");
      const ncm = getText(prod, "NCM");
      const barcode = getText(prod, "cEAN") || getText(prod, "cEANTrib");
      const unit = getText(prod, "uCom") || getText(prod, "uTrib") || "UN";
      const quantity = parseFloat(getText(prod, "qCom") || getText(prod, "qTrib")) || 0;
      const unitPrice = parseFloat(getText(prod, "vUnCom") || getText(prod, "vUnTrib")) || 0;
      const totalPrice = parseFloat(getText(prod, "vProd")) || 0;

      const product: NFeProduct = {
        name,
        ncm,
        barcode: barcode === "SEM GTIN" ? "" : barcode,
        unit: unit.toUpperCase(),
        quantity,
        unitPrice,
        totalPrice,
        valid: !!name && unitPrice > 0,
        error: !name ? "Nome vazio" : unitPrice <= 0 ? "Preço unitário inválido" : undefined,
      };

      nfeInfo.products.push(product);
    }

    return nfeInfo;
  } catch {
    return null;
  }
}

export function NFeImportDialog({ open, onOpenChange }: NFeImportDialogProps) {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
  const [nfeInfo, setNfeInfo] = useState<NFeInfo | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: number }>({ imported: 0, errors: 0 });
  const [updateStock, setUpdateStock] = useState(true);

  const reset = () => { setStep("upload"); setNfeInfo(null); setResult({ imported: 0, errors: 0 }); };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseNFeXML(text);
      if (!parsed || parsed.products.length === 0) {
        toast.error("Arquivo XML inválido ou sem produtos");
        return;
      }
      setNfeInfo(parsed);
      setStep("preview");
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  };

  const handleImport = async () => {
    if (!companyId || !nfeInfo) return;
    setImporting(true);
    const validProducts = nfeInfo.products.filter((p) => p.valid);
    let imported = 0;
    let errors = 0;

    for (const p of validProducts) {
      // Check if product exists by barcode
      let existingId: string | null = null;
      if (p.barcode) {
        const { data: existing } = await supabase
          .from("products")
          .select("id, stock_quantity")
          .eq("company_id", companyId)
          .eq("barcode", p.barcode)
          .limit(1)
          .maybeSingle();

        if (existing) {
          existingId = existing.id;
          if (updateStock) {
            const newStock = (existing.stock_quantity || 0) + p.quantity;
            const { error } = await supabase.from("products").update({
              stock_quantity: newStock,
              cost_price: p.unitPrice,
            }).eq("id", existing.id);
            if (error) { errors++; } else { imported++; }
          } else {
            imported++; // counted as processed
          }
          continue;
        }
      }

      // Create new product
      const { error } = await supabase.from("products").insert({
        name: p.name,
        sku: "",
        barcode: p.barcode || null,
        ncm: p.ncm || null,
        price: p.unitPrice,
        cost_price: p.unitPrice,
        stock_quantity: p.quantity,
        unit: p.unit,
        company_id: companyId,
        is_active: true,
      });
      if (error) { errors++; } else { imported++; }
    }

    setResult({ imported, errors });
    setStep("done");
    setImporting(false);
    queryClient.invalidateQueries({ queryKey: ["products"] });
    if (imported > 0) toast.success(`${imported} produto(s) importado(s) da NF-e!`);
    if (errors > 0) toast.error(`${errors} produto(s) com erro`);
  };

  if (!open) return null;

  const validCount = nfeInfo?.products.filter((p) => p.valid).length || 0;
  const invalidCount = nfeInfo?.products.filter((p) => !p.valid).length || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { reset(); onOpenChange(false); }}>
      <div className="bg-card rounded-xl border border-border max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Importar NF-e (XML)</h2>
          <button onClick={() => { reset(); onOpenChange(false); }} className="text-muted-foreground hover:text-foreground text-xl leading-none">&times;</button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {step === "upload" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Faça upload do arquivo XML da Nota Fiscal Eletrônica. Os produtos serão extraídos automaticamente e cadastrados ou atualizados no estoque.
              </p>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
              >
                <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground">Clique para selecionar o XML da NF-e</p>
                <p className="text-xs text-muted-foreground mt-1">Formato: .xml (NF-e padrão SEFAZ)</p>
              </div>
              <input ref={fileInputRef} type="file" accept=".xml" onChange={handleFile} className="hidden" />
            </div>
          )}

          {step === "preview" && nfeInfo && (
            <div className="space-y-4">
              {/* NF-e Info */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">NF-e {nfeInfo.number}{nfeInfo.series ? ` / Série ${nfeInfo.series}` : ""}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div><strong className="text-foreground">Fornecedor:</strong> {nfeInfo.supplierName}</div>
                  <div><strong className="text-foreground">CNPJ:</strong> {nfeInfo.supplierCnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")}</div>
                  <div><strong className="text-foreground">Emissão:</strong> {nfeInfo.issueDate ? new Date(nfeInfo.issueDate + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</div>
                  <div><strong className="text-foreground">Total:</strong> R$ {nfeInfo.totalValue.toFixed(2).replace(".", ",")}</div>
                </div>
              </div>

              {/* Options */}
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input type="checkbox" checked={updateStock} onChange={(e) => setUpdateStock(e.target.checked)}
                  className="rounded border-border" />
                Atualizar estoque de produtos já cadastrados (por código de barras)
              </label>

              {/* Product counts */}
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1.5 text-success"><CheckCircle2 className="w-4 h-4" /> {validCount} válido(s)</span>
                {invalidCount > 0 && <span className="flex items-center gap-1.5 text-destructive"><AlertCircle className="w-4 h-4" /> {invalidCount} com erro</span>}
              </div>

              {/* Products table */}
              <div className="border border-border rounded-lg overflow-x-auto max-h-52">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-muted-foreground">Status</th>
                      <th className="px-3 py-2 text-left text-muted-foreground">Produto</th>
                      <th className="px-3 py-2 text-left text-muted-foreground">NCM</th>
                      <th className="px-3 py-2 text-right text-muted-foreground">Qtd</th>
                      <th className="px-3 py-2 text-right text-muted-foreground">Vlr Unit</th>
                      <th className="px-3 py-2 text-left text-muted-foreground">UN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nfeInfo.products.map((p, i) => (
                      <tr key={i} className={`border-t border-border ${!p.valid ? "bg-destructive/5" : ""}`}>
                        <td className="px-3 py-1.5">{p.valid ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <AlertCircle className="w-3.5 h-3.5 text-destructive" />}</td>
                        <td className="px-3 py-1.5 text-foreground truncate max-w-[200px]">{p.name}</td>
                        <td className="px-3 py-1.5 text-muted-foreground font-mono">{p.ncm || "—"}</td>
                        <td className="px-3 py-1.5 text-right text-foreground font-mono">{p.quantity}</td>
                        <td className="px-3 py-1.5 text-right text-foreground font-mono">R$ {p.unitPrice.toFixed(2).replace(".", ",")}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{p.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === "done" && (
            <div className="text-center py-8 space-y-3">
              <Package className="w-12 h-12 text-success mx-auto" />
              <p className="text-lg font-semibold text-foreground">Importação da NF-e concluída!</p>
              <p className="text-sm text-muted-foreground">{result.imported} produto(s) importado(s)/atualizado(s){result.errors > 0 ? `, ${result.errors} com erro` : ""}.</p>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border flex justify-end gap-3">
          {step === "preview" && (
            <>
              <button onClick={reset} className="px-4 py-2 rounded-lg bg-muted text-muted-foreground text-sm font-medium hover:opacity-90">Voltar</button>
              <button onClick={handleImport} disabled={importing || validCount === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
                {importing ? "Importando..." : `Importar ${validCount} produto(s)`}
              </button>
            </>
          )}
          {step === "done" && (
            <button onClick={() => { reset(); onOpenChange(false); }} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">Fechar</button>
          )}
        </div>
      </div>
    </div>
  );
}