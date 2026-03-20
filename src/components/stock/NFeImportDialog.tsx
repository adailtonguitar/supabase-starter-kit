import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, FileText, AlertCircle, CheckCircle2, Loader2, Package, Pencil, Trash2, Factory, Plus, Link, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { recordPriceChanges } from "@/lib/price-history";
import { useSuppliers } from "@/hooks/useSuppliers";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { logAction } from "@/services/ActionLogger";
import { Badge } from "@/components/ui/badge";

interface NFeImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  xmlContent?: string; // Pre-loaded XML content (from DFe import)
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
  // New fields
  existingProductId?: string | null;
  currentStock?: number;
  margin: number;       // percentage
  salePrice: number;    // calculated from unitPrice + margin
}

interface NFeInfo {
  number: string;
  series: string;
  accessKey: string;
  issueDate: string;
  supplierName: string;
  supplierCnpj: string;
  supplierTradeName: string;
  supplierIe: string;
  supplierPhone: string;
  supplierEmail: string;
  totalValue: number;
  products: NFeProduct[];
}

interface SupplierLookup {
  id: string;
  cnpj?: string | null;
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function parseNFeXML(xmlText: string): NFeInfo | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "text/xml");

    const parseError = doc.querySelector("parsererror");
    if (parseError) return null;

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

    // Extract access key from protNFe > infProt > chNFe or from infNFe Id attribute
    let accessKey = "";
    const chNFeEl = getEl(doc, "chNFe");
    if (chNFeEl?.textContent) {
      accessKey = chNFeEl.textContent.trim();
    } else {
      // Fallback: infNFe Id attribute (format: "NFe" + 44 digits)
      const infNFe = getEl(doc, "infNFe");
      const idAttr = infNFe?.getAttribute("Id") || "";
      if (idAttr.length >= 44) {
        accessKey = idAttr.replace(/^NFe/, "");
      }
    }

    // Extract additional supplier data from emit element
    const enderEmit = emit ? getEl(emit, "enderEmit") : null;

    const nfeInfo: NFeInfo = {
      number: ide ? getText(ide, "nNF") : "",
      series: ide ? getText(ide, "serie") : "",
      accessKey,
      issueDate: ide ? getText(ide, "dhEmi").slice(0, 10) : "",
      supplierName: emit ? getText(emit, "xNome") : "",
      supplierCnpj: emit ? getText(emit, "CNPJ") : "",
      supplierTradeName: emit ? getText(emit, "xFant") : "",
      supplierIe: emit ? getText(emit, "IE") : "",
      supplierPhone: enderEmit ? getText(enderEmit, "fone") : "",
      supplierEmail: emit ? getText(emit, "email") : "",
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

      const defaultMargin = 30;
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
        existingProductId: null,
        currentStock: 0,
        margin: defaultMargin,
        salePrice: parseFloat((unitPrice * (1 + defaultMargin / 100)).toFixed(2)),
      };

      nfeInfo.products.push(product);
    }

    return nfeInfo;
  } catch {
    return null;
  }
}

export function NFeImportDialog({ open, onOpenChange, xmlContent }: NFeImportDialogProps) {
  const { companyId } = useCompany();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: suppliers = [] } = useSuppliers();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
  const [nfeInfo, setNfeInfo] = useState<NFeInfo | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: number; updated: number }>({ imported: 0, errors: 0, updated: 0 });
  const [updateStock, setUpdateStock] = useState(true);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [checkingStock, setCheckingStock] = useState(false);

  // Supplier linking state
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplierStatus, setSupplierStatus] = useState<"checking" | "found" | "not_found" | "created">("checking");
  const [creatingSupplier, setCreatingSupplier] = useState(false);

  const reset = () => {
    setStep("upload"); setNfeInfo(null); setResult({ imported: 0, errors: 0, updated: 0 });
    setEditingIndex(null); setSupplierId(null); setSupplierStatus("checking"); setCheckingStock(false);
  };

  // Auto-detect supplier when preview loads
  useEffect(() => {
    if (step !== "preview" || !nfeInfo?.supplierCnpj) {
      setSupplierStatus("checking");
      return;
    }
    const cnpjClean = nfeInfo.supplierCnpj.replace(/\D/g, "");
    const found = (suppliers as SupplierLookup[]).find((s) => (s.cnpj || "").replace(/\D/g, "") === cnpjClean);
    if (found) {
      setSupplierId(found.id);
      setSupplierStatus("found");
    } else {
      setSupplierId(null);
      setSupplierStatus("not_found");
    }
  }, [step, nfeInfo?.supplierCnpj, suppliers]);

  // Auto-parse pre-loaded XML content
  useEffect(() => {
    if (!open || !xmlContent || nfeInfo) return;
    const parsed = parseNFeXML(xmlContent);
    if (!parsed || parsed.products.length === 0) {
      toast.error("XML inválido ou sem produtos");
      return;
    }
    setNfeInfo(parsed);
    setStep("preview");
  }, [open, xmlContent]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check existing products by barcode when preview loads
  useEffect(() => {
    if (step !== "preview" || !nfeInfo || !companyId) return;

    const checkExistingProducts = async () => {
      setCheckingStock(true);
      const barcodes = nfeInfo.products
        .map(p => p.barcode)
        .filter(Boolean);

      if (barcodes.length === 0) {
        setCheckingStock(false);
        return;
      }

      const { data: existing } = await supabase
        .from("products")
        .select("id, barcode, stock_quantity, price")
        .eq("company_id", companyId)
        .in("barcode", barcodes);

      if (existing && existing.length > 0) {
        setNfeInfo(prev => {
          if (!prev) return prev;
          const updatedProducts = prev.products.map(p => {
            if (!p.barcode) return p;
            const match = existing.find(e => e.barcode === p.barcode);
            if (match) {
              return {
                ...p,
                existingProductId: match.id,
                currentStock: match.stock_quantity || 0,
                salePrice: match.price || p.salePrice,
              };
            }
            return p;
          });
          return { ...prev, products: updatedProducts };
        });
      }
      setCheckingStock(false);
    };

    checkExistingProducts();
  }, [step, companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateSupplier = async () => {
    if (!companyId || !nfeInfo) return;
    setCreatingSupplier(true);
    try {
      const supplierData: Record<string, unknown> = {
        company_id: companyId,
        name: nfeInfo.supplierName,
        cnpj: nfeInfo.supplierCnpj,
      };
      if (nfeInfo.supplierTradeName) supplierData.trade_name = nfeInfo.supplierTradeName;
      if (nfeInfo.supplierIe) supplierData.ie = nfeInfo.supplierIe;
      if (nfeInfo.supplierPhone) supplierData.phone = nfeInfo.supplierPhone;
      if (nfeInfo.supplierEmail) supplierData.email = nfeInfo.supplierEmail;

      const { data, error } = await supabase.from("suppliers").insert(supplierData).select("id").single();
      if (error) throw error;
      setSupplierId(data.id);
      setSupplierStatus("created");
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("Fornecedor cadastrado com sucesso!");
    } catch (err: unknown) {
      toast.error("Erro ao cadastrar fornecedor: " + getErrorMessage(err));
    } finally {
      setCreatingSupplier(false);
    }
  };

  const updateProduct = useCallback((index: number, field: keyof NFeProduct | "margin" | "salePrice", value: string | number) => {
    if (!nfeInfo) return;
    setNfeInfo(prev => {
      if (!prev) return prev;
      const updated = { ...prev, products: [...prev.products] };
      const p = { ...updated.products[index] };
      if (field === "name") p.name = value as string;
      else if (field === "ncm") p.ncm = value as string;
      // quantity is read-only — comes from NF-e XML and must not be edited
      else if (field === "unitPrice") {
        p.unitPrice = Number(value) || 0;
        p.totalPrice = p.quantity * p.unitPrice;
        p.salePrice = parseFloat((p.unitPrice * (1 + p.margin / 100)).toFixed(2));
      }
      else if (field === "unit") p.unit = (value as string).toUpperCase();
      else if (field === "margin") {
        p.margin = Number(value) || 0;
        p.salePrice = parseFloat((p.unitPrice * (1 + p.margin / 100)).toFixed(2));
      }
      else if (field === "salePrice") {
        p.salePrice = Number(value) || 0;
        p.margin = p.unitPrice > 0 ? parseFloat((((p.salePrice / p.unitPrice) - 1) * 100).toFixed(1)) : 0;
      }
      p.valid = !!p.name && p.unitPrice > 0;
      p.error = !p.name ? "Nome vazio" : p.unitPrice <= 0 ? "Preço unitário inválido" : undefined;
      updated.products[index] = p;
      return updated;
    });
  }, [nfeInfo]);

  const removeProduct = useCallback((index: number) => {
    if (!nfeInfo) return;
    setNfeInfo(prev => {
      if (!prev) return prev;
      return { ...prev, products: prev.products.filter((_, i) => i !== index) };
    });
    setEditingIndex(null);
  }, [nfeInfo]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseNFeXML(text);
      if (!parsed || parsed.products.length === 0) {
        toast.error("Arquivo XML inválido ou sem produtos");
        return;
      }

      // Check for duplicate import
      if (parsed.accessKey && companyId) {
        const { data: existing } = await supabase
          .from("nfe_imports")
          .select("id, imported_at")
          .eq("company_id", companyId)
          .eq("access_key", parsed.accessKey)
          .maybeSingle();

        if (existing) {
          const importedDate = new Date(existing.imported_at).toLocaleDateString("pt-BR");
          toast.error(`Esta NF-e já foi importada em ${importedDate}. Importação bloqueada para evitar duplicidade.`);
          return;
        }
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
    let updated = 0;

    for (const p of validProducts) {
      // Check if product exists by barcode
      if (p.barcode) {
        const { data: existing } = await supabase
          .from("products")
          .select("id, stock_quantity, cost_price, price")
          .eq("company_id", companyId)
          .eq("barcode", p.barcode)
          .limit(1)
          .maybeSingle();

        if (existing) {
          if (updateStock) {
            const previousStock = existing.stock_quantity || 0;
            const newStock = previousStock + p.quantity;
            const updateData: Record<string, unknown> = {
              stock_quantity: newStock,
              cost_price: p.unitPrice,
              price: p.salePrice,
            };
            if (supplierId) updateData.supplier_id = supplierId;

            const { error } = await supabase.from("products").update(updateData).eq("id", existing.id);
            if (error) { console.error("[NFeImport] update error:", error.message); errors++; } else {
              updated++;
              // Register stock movement for traceability
              await supabase.from("stock_movements" as never).insert({
                company_id: companyId,
                product_id: existing.id,
                type: "entrada",
                quantity: p.quantity,
                previous_stock: previousStock,
                new_stock: newStock,
                unit_cost: p.unitPrice,
                reason: `Importação NF-e ${nfeInfo.number || ""}`.trim(),
                reference: nfeInfo.accessKey || null,
                performed_by: user?.id || null,
              });
              // Record price changes
              const changes: Array<{ company_id: string; product_id: string; field_changed: "price" | "cost_price"; old_value: number; new_value: number; changed_by?: string | null; source: "xml_import" }> = [];
              if (p.unitPrice !== (existing.cost_price ?? 0)) {
                changes.push({ company_id: companyId!, product_id: existing.id, field_changed: "cost_price", old_value: existing.cost_price ?? 0, new_value: p.unitPrice, changed_by: user?.id, source: "xml_import" });
              }
              if (p.salePrice !== (existing.price ?? 0)) {
                changes.push({ company_id: companyId!, product_id: existing.id, field_changed: "price", old_value: existing.price ?? 0, new_value: p.salePrice, changed_by: user?.id, source: "xml_import" });
              }
              if (changes.length > 0) recordPriceChanges(changes);
            }
          } else {
            updated++;
          }
          continue;
        }
      }

      // Create new product
      const autoSku = `NFE-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const insertData: Record<string, unknown> = {
        name: p.name,
        sku: autoSku,
        barcode: p.barcode || null,
        ncm: p.ncm || null,
        price: p.salePrice,
        cost_price: p.unitPrice,
        stock_quantity: p.quantity,
        unit: p.unit,
        company_id: companyId,
        is_active: true,
      };
      if (supplierId) insertData.supplier_id = supplierId;

      const { data: newProduct, error } = await supabase.from("products").insert(insertData).select("id").single();
      if (error) { console.error("[NFeImport] insert error:", error.message, error.details, error.code); errors++; } else {
        imported++;
        // Register initial stock movement for new product
        await supabase.from("stock_movements" as never).insert({
          company_id: companyId,
          product_id: newProduct.id,
          type: "entrada",
          quantity: p.quantity,
          previous_stock: 0,
          new_stock: p.quantity,
          unit_cost: p.unitPrice,
          reason: `Importação NF-e ${nfeInfo.number || ""}`.trim(),
          reference: nfeInfo.accessKey || null,
          performed_by: user?.id || null,
        });
      }
    }

    // Register NF-e as imported to prevent duplicates
    if (nfeInfo.accessKey && (imported + updated) > 0) {
      await supabase.from("nfe_imports").insert({
        company_id: companyId,
        access_key: nfeInfo.accessKey,
        nfe_number: nfeInfo.number,
        supplier_name: nfeInfo.supplierName,
        supplier_cnpj: nfeInfo.supplierCnpj,
        total_value: nfeInfo.totalValue,
        products_count: imported + updated,
      });
    }

    setResult({ imported, errors, updated });
    setStep("done");
    setImporting(false);
    queryClient.invalidateQueries({ queryKey: ["products"] });
    const total = imported + updated;
    if (total > 0) {
      logAction({ companyId: companyId!, userId: user?.id, action: "Importação NF-e concluída", module: "estoque", details: `${imported} novo(s), ${updated} atualizado(s), ${errors} erro(s) - NF ${nfeInfo?.number || ""}` });
      toast.success(`${imported} novo(s), ${updated} atualizado(s)!`);
    }
    if (errors > 0) toast.error(`${errors} produto(s) com erro`);
  };

  if (!open) return null;

  const validCount = nfeInfo?.products.filter((p) => p.valid).length || 0;
  const invalidCount = nfeInfo?.products.filter((p) => !p.valid).length || 0;
  const existingCount = nfeInfo?.products.filter((p) => p.existingProductId).length || 0;
  const newCount = validCount - existingCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { reset(); onOpenChange(false); }}>
      <div className="bg-card rounded-xl border border-border max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
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

              {/* Supplier linking */}
              <div className="bg-muted/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Factory className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Fornecedor</span>
                </div>
                {supplierStatus === "found" && (
                  <div className="flex items-center gap-2 text-sm text-success">
                    <Link className="w-3.5 h-3.5" />
                    <span>Fornecedor já cadastrado: <strong>{nfeInfo.supplierName}</strong></span>
                  </div>
                )}
                {supplierStatus === "created" && (
                  <div className="flex items-center gap-2 text-sm text-success">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Fornecedor cadastrado: <strong>{nfeInfo.supplierName}</strong></span>
                  </div>
                )}
                {supplierStatus === "not_found" && (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">
                      Fornecedor <strong className="text-foreground">{nfeInfo.supplierName}</strong> não cadastrado.
                    </span>
                    <button
                      onClick={handleCreateSupplier}
                      disabled={creatingSupplier}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
                    >
                      {creatingSupplier ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      Cadastrar
                    </button>
                  </div>
                )}
                {supplierStatus === "checking" && (
                  <span className="text-xs text-muted-foreground">Verificando...</span>
                )}
              </div>

              {/* Options */}
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input type="checkbox" checked={updateStock} onChange={(e) => setUpdateStock(e.target.checked)}
                  className="rounded border-border" />
                Atualizar estoque de produtos já cadastrados (por código de barras)
              </label>

              {/* Product counts */}
              <div className="flex items-center gap-4 text-sm flex-wrap">
                <span className="flex items-center gap-1.5 text-success"><CheckCircle2 className="w-4 h-4" /> {validCount} válido(s)</span>
                {invalidCount > 0 && <span className="flex items-center gap-1.5 text-destructive"><AlertCircle className="w-4 h-4" /> {invalidCount} com erro</span>}
                {checkingStock ? (
                  <span className="flex items-center gap-1.5 text-muted-foreground"><RefreshCw className="w-4 h-4 animate-spin" /> Verificando estoque...</span>
                ) : (
                  <>
                    {existingCount > 0 && <Badge variant="secondary" className="text-xs">{existingCount} já cadastrado(s)</Badge>}
                    {newCount > 0 && <Badge variant="outline" className="text-xs">{newCount} novo(s)</Badge>}
                  </>
                )}
              </div>

              {/* Batch margin */}
              <div className="flex items-center gap-3 bg-muted/50 rounded-lg px-4 py-2.5">
                <span className="text-xs font-medium text-foreground whitespace-nowrap">Margem em lote:</span>
                <input
                  type="number"
                  step="0.1"
                  placeholder="Ex: 30"
                  className="w-20 bg-background border border-border rounded px-2 py-1 text-xs text-foreground font-mono text-right"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const val = parseFloat((e.target as HTMLInputElement).value);
                      if (!isNaN(val) && nfeInfo) {
                        setNfeInfo(prev => {
                          if (!prev) return prev;
                          return {
                            ...prev,
                            products: prev.products.map(p => ({
                              ...p,
                              margin: val,
                              salePrice: parseFloat((p.unitPrice * (1 + val / 100)).toFixed(2)),
                            })),
                          };
                        });
                        toast.success(`Margem de ${val}% aplicada a todos os produtos`);
                      }
                    }
                  }}
                />
                <span className="text-[10px] text-muted-foreground">%</span>
                <button
                  onClick={() => {
                    const input = document.querySelector<HTMLInputElement>('[placeholder="Ex: 30"]');
                    const val = parseFloat(input?.value || "");
                    if (!isNaN(val) && nfeInfo) {
                      setNfeInfo(prev => {
                        if (!prev) return prev;
                        return {
                          ...prev,
                          products: prev.products.map(p => ({
                            ...p,
                            margin: val,
                            salePrice: parseFloat((p.unitPrice * (1 + val / 100)).toFixed(2)),
                          })),
                        };
                      });
                      toast.success(`Margem de ${val}% aplicada a todos os produtos`);
                    }
                  }}
                  className="px-3 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90"
                >
                  Aplicar
                </button>
              </div>

              {/* Products table */}
              <div className="border border-border rounded-lg overflow-x-auto max-h-72">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="px-2 py-2 text-left text-muted-foreground w-8"></th>
                      <th className="px-2 py-2 text-left text-muted-foreground">Produto</th>
                      <th className="px-2 py-2 text-right text-muted-foreground w-14">Qtd</th>
                      <th className="px-2 py-2 text-right text-muted-foreground w-20">Custo</th>
                      <th className="px-2 py-2 text-right text-muted-foreground w-16">Margem%</th>
                      <th className="px-2 py-2 text-right text-muted-foreground w-20">Venda</th>
                      <th className="px-2 py-2 text-left text-muted-foreground w-14">UN</th>
                      <th className="px-2 py-2 text-center text-muted-foreground w-16">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nfeInfo.products.map((p, i) => (
                      <tr key={i} className={`border-t border-border ${!p.valid ? "bg-destructive/5" : ""} ${editingIndex === i ? "bg-primary/5" : ""} ${p.existingProductId ? "bg-accent/30" : ""}`}>
                        <td className="px-2 py-1.5">
                          {p.valid ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <AlertCircle className="w-3.5 h-3.5 text-destructive" />}
                        </td>
                        <td className="px-2 py-1.5">
                          {editingIndex === i ? (
                            <input value={p.name} onChange={(e) => updateProduct(i, "name", e.target.value)}
                              className="w-full bg-background border border-border rounded px-1.5 py-0.5 text-xs text-foreground" />
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="text-foreground truncate block max-w-[180px]">{p.name}</span>
                              {p.existingProductId && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                                  Estoque: {p.currentStock}
                                </Badge>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <span className="text-foreground font-mono">{p.quantity}</span>
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {editingIndex === i ? (
                            <input type="number" step="0.01" value={p.unitPrice} onChange={(e) => updateProduct(i, "unitPrice", e.target.value)}
                              className="w-full bg-background border border-border rounded px-1.5 py-0.5 text-xs text-foreground font-mono text-right" />
                          ) : (
                            <span className="text-foreground font-mono">{p.unitPrice.toFixed(2).replace(".", ",")}</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {editingIndex === i ? (
                            <input type="number" step="0.1" value={p.margin} onChange={(e) => updateProduct(i, "margin", e.target.value)}
                              className="w-full bg-background border border-border rounded px-1.5 py-0.5 text-xs text-foreground font-mono text-right" />
                          ) : (
                            <span className="text-muted-foreground font-mono">{p.margin}%</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {editingIndex === i ? (
                            <input type="number" step="0.01" value={p.salePrice} onChange={(e) => updateProduct(i, "salePrice", e.target.value)}
                              className="w-full bg-background border border-border rounded px-1.5 py-0.5 text-xs text-foreground font-mono text-right" />
                          ) : (
                            <span className="text-foreground font-mono font-semibold">{p.salePrice.toFixed(2).replace(".", ",")}</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          {editingIndex === i ? (
                            <input value={p.unit} onChange={(e) => updateProduct(i, "unit", e.target.value)}
                              className="w-full bg-background border border-border rounded px-1.5 py-0.5 text-xs text-foreground" maxLength={5} />
                          ) : (
                            <span className="text-muted-foreground">{p.unit}</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => setEditingIndex(editingIndex === i ? null : i)}
                              className={`p-1 rounded hover:bg-accent transition-colors ${editingIndex === i ? "text-primary" : "text-muted-foreground"}`}
                              title={editingIndex === i ? "Concluir edição" : "Editar produto"}>
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => removeProduct(i)}
                              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                              title="Remover produto">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-muted-foreground">
                💡 Clique no lápis para editar custo, margem e preço de venda antes de importar. Produtos com fundo destacado já existem no estoque.
              </p>
            </div>
          )}

          {step === "done" && (
            <div className="text-center py-8 space-y-3">
              <Package className="w-12 h-12 text-success mx-auto" />
              <p className="text-lg font-semibold text-foreground">Importação da NF-e concluída!</p>
              <p className="text-sm text-muted-foreground">
                {result.imported > 0 && `${result.imported} produto(s) novo(s) cadastrado(s)`}
                {result.imported > 0 && result.updated > 0 && ", "}
                {result.updated > 0 && `${result.updated} atualizado(s)`}
                {result.errors > 0 ? `, ${result.errors} com erro` : ""}.
              </p>
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
