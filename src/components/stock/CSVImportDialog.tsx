import { useState, useRef } from "react";
import { Upload, FileText, AlertCircle, CheckCircle2, Loader2, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface CSVImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ParsedProduct {
  name: string;
  sku: string;
  barcode: string;
  ncm: string;
  category: string;
  price: number;
  cost_price: number;
  stock_quantity: number;
  min_stock: number;
  unit: string;
  valid: boolean;
  error?: string;
}

const EXPECTED_HEADERS = ["nome", "sku", "codigo_barras", "ncm", "categoria", "preco_venda", "preco_custo", "estoque", "estoque_minimo", "unidade"];

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if ((ch === "," || ch === ";") && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): { products: ParsedProduct[]; errors: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { products: [], errors: ["Arquivo vazio ou sem dados"] };

  const headerLine = lines[0].toLowerCase().replace(/[áàã]/g, "a").replace(/[éê]/g, "e").replace(/[íî]/g, "i").replace(/[óôõ]/g, "o").replace(/[úû]/g, "u").replace(/ç/g, "c");
  const headers = parseCSVLine(headerLine);

  const nameIdx = headers.findIndex((h) => h.includes("nome") || h.includes("descri"));
  const skuIdx = headers.findIndex((h) => (h.includes("sku") || h.includes("codigo")) && !h.includes("barra"));
  const barcodeIdx = headers.findIndex((h) => h.includes("barra") || h.includes("ean") || h.includes("gtin"));
  // If "codigo" column exists and no barcode column found, use "codigo" as barcode
  const finalBarcodeIdx = barcodeIdx === -1 ? headers.findIndex((h) => h === "codigo") : barcodeIdx;
  const ncmIdx = headers.findIndex((h) => h.includes("ncm"));
  const categoryIdx = headers.findIndex((h) => h.includes("categ") || h.includes("grupo") || h.includes("subcateg"));
  const priceIdx = headers.findIndex((h) => h.includes("varejo") || (h.includes("preco") && (h.includes("venda") || !h.includes("custo"))) || h.includes("valor"));
  const costIdx = headers.findIndex((h) => h.includes("custo"));
  const stockIdx = headers.findIndex((h) => (h.includes("estoque") || h.includes("qtd") || h.includes("quantidade")) && !h.includes("min"));
  const minStockIdx = headers.findIndex((h) => h.includes("min"));
  const unitIdx = headers.findIndex((h) => h.includes("unid") || h.includes("un"));

  if (nameIdx === -1) return { products: [], errors: ["Coluna 'nome' não encontrada no cabeçalho"] };

  const products: ParsedProduct[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const name = cols[nameIdx]?.trim();
    if (!name) { errors.push(`Linha ${i + 1}: nome vazio, ignorada`); continue; }

    const parseNum = (idx: number) => {
      if (idx === -1) return 0;
      const raw = (cols[idx] || "").replace(/[R$\s]/g, "").replace(",", ".");
      const num = parseFloat(raw);
      return isNaN(num) ? 0 : num;
    };

    const product: ParsedProduct = {
      name,
      sku: skuIdx >= 0 ? cols[skuIdx]?.trim() || "" : "",
      barcode: finalBarcodeIdx >= 0 ? cols[finalBarcodeIdx]?.trim() || "" : "",
      ncm: ncmIdx >= 0 ? cols[ncmIdx]?.trim() || "" : "",
      category: categoryIdx >= 0 ? cols[categoryIdx]?.trim() || "" : "",
      price: parseNum(priceIdx),
      cost_price: parseNum(costIdx),
      stock_quantity: parseNum(stockIdx),
      min_stock: parseNum(minStockIdx),
      unit: unitIdx >= 0 ? cols[unitIdx]?.trim() || "UN" : "UN",
      valid: true,
    };

    // Allow price 0 — just warn, don't block
    if (product.price <= 0 && product.cost_price <= 0) {
      product.error = "Sem preço de venda e custo";
    }

    products.push(product);
  }

  return { products, errors };
}

export function CSVImportDialog({ open, onOpenChange }: CSVImportDialogProps) {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
  const [products, setProducts] = useState<ParsedProduct[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: number }>({ imported: 0, errors: 0 });

  const reset = () => { setStep("upload"); setProducts([]); setParseErrors([]); setResult({ imported: 0, errors: 0 }); };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { products: parsed, errors } = parseCSV(text);
      setProducts(parsed);
      setParseErrors(errors);
      setStep("preview");
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  };

  const handleImport = async () => {
    if (!companyId) return;
    setImporting(true);
    const validProducts = products.filter((p) => p.valid);
    let imported = 0;
    let errors = 0;

    const batchSize = 50;
    for (let i = 0; i < validProducts.length; i += batchSize) {
      const batch = validProducts.slice(i, i + batchSize).map((p, idx) => ({
        name: p.name,
        sku: p.sku || `IMP-${Date.now().toString(36).toUpperCase()}-${i + idx}`,
        barcode: p.barcode || null,
        ncm: p.ncm || null,
        category: p.category || null,
        price: p.price,
        cost_price: p.cost_price || null,
        stock_quantity: p.stock_quantity,
        min_stock: p.min_stock || null,
        unit: p.unit,
        company_id: companyId,
        is_active: true,
      }));

      const { data, error } = await supabase.from("products").insert(batch).select("id");
      if (error) {
        errors += batch.length;
      } else {
        imported += data.length;
      }
    }

    setResult({ imported, errors });
    setStep("done");
    setImporting(false);
    queryClient.invalidateQueries({ queryKey: ["products"] });
    if (imported > 0) toast.success(`${imported} produto(s) importado(s)!`);
    if (errors > 0) toast.error(`${errors} produto(s) com erro`);
  };

  const downloadTemplate = () => {
    const csv = "nome;sku;codigo_barras;ncm;categoria;preco_venda;preco_custo;estoque;estoque_minimo;unidade\nProduto Exemplo;SKU001;7891234567890;21069090;Alimentos;9.90;5.50;100;10;UN";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo_importacao_produtos.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!open) return null;

  const validCount = products.filter((p) => p.valid).length;
  const invalidCount = products.filter((p) => !p.valid).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { reset(); onOpenChange(false); }}>
      <div className="bg-card rounded-xl border border-border max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Importar Produtos via CSV</h2>
          <button onClick={() => { reset(); onOpenChange(false); }} className="text-muted-foreground hover:text-foreground text-xl leading-none">&times;</button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {step === "upload" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Faça upload de um arquivo CSV com os dados dos produtos. O sistema detecta automaticamente as colunas pelo cabeçalho.
              </p>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
              >
                <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground">Clique para selecionar o arquivo CSV</p>
                <p className="text-xs text-muted-foreground mt-1">Formatos aceitos: .csv (separado por vírgula ou ponto-e-vírgula)</p>
              </div>
              <input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
              <button onClick={downloadTemplate} className="flex items-center gap-2 text-sm text-primary hover:underline">
                <Download className="w-4 h-4" /> Baixar modelo CSV de exemplo
              </button>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1.5 text-success"><CheckCircle2 className="w-4 h-4" /> {validCount} válido(s)</span>
                {invalidCount > 0 && <span className="flex items-center gap-1.5 text-destructive"><AlertCircle className="w-4 h-4" /> {invalidCount} com erro</span>}
              </div>

              {parseErrors.length > 0 && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 space-y-1">
                  {parseErrors.slice(0, 5).map((err, i) => (
                    <p key={i} className="text-xs text-destructive">{err}</p>
                  ))}
                  {parseErrors.length > 5 && <p className="text-xs text-destructive">...e mais {parseErrors.length - 5} aviso(s)</p>}
                </div>
              )}

              <div className="border border-border rounded-lg overflow-x-auto max-h-64">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-muted-foreground">Status</th>
                      <th className="px-3 py-2 text-left text-muted-foreground">Nome</th>
                      <th className="px-3 py-2 text-left text-muted-foreground">SKU</th>
                      <th className="px-3 py-2 text-right text-muted-foreground">Preço</th>
                      <th className="px-3 py-2 text-right text-muted-foreground">Estoque</th>
                      <th className="px-3 py-2 text-left text-muted-foreground">UN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.slice(0, 50).map((p, i) => (
                      <tr key={i} className={`border-t border-border ${!p.valid ? "bg-destructive/5" : ""}`}>
                        <td className="px-3 py-1.5">{p.valid ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <AlertCircle className="w-3.5 h-3.5 text-destructive" />}</td>
                        <td className="px-3 py-1.5 text-foreground truncate max-w-[200px]">{p.name}</td>
                        <td className="px-3 py-1.5 text-muted-foreground font-mono">{p.sku || "—"}</td>
                        <td className="px-3 py-1.5 text-right text-foreground font-mono">R$ {p.price.toFixed(2).replace(".", ",")}</td>
                        <td className="px-3 py-1.5 text-right text-foreground font-mono">{p.stock_quantity}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{p.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {products.length > 50 && <p className="text-xs text-muted-foreground text-center py-2">Mostrando 50 de {products.length} produtos</p>}
              </div>
            </div>
          )}

          {step === "done" && (
            <div className="text-center py-8 space-y-3">
              <CheckCircle2 className="w-12 h-12 text-success mx-auto" />
              <p className="text-lg font-semibold text-foreground">Importação concluída!</p>
              <p className="text-sm text-muted-foreground">{result.imported} produto(s) importado(s){result.errors > 0 ? `, ${result.errors} com erro` : ""}.</p>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border flex justify-end gap-3">
          {step === "preview" && (
            <>
              <button onClick={reset} className="px-4 py-2 rounded-lg bg-muted text-muted-foreground text-sm font-medium hover:opacity-90">Voltar</button>
              <button onClick={handleImport} disabled={importing || validCount === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
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