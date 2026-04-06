import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, FileText, AlertCircle, CheckCircle2, Loader2, Package,
  Pencil, Trash2, Factory, Plus, Link, RefreshCw, Brain, Lightbulb,
  TrendingDown, AlertTriangle, Eye, X, Sparkles, FileSearch, ShieldCheck,
  BarChart3, ArrowRight, Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { recordPriceChanges } from "@/lib/price-history";
import { useSuppliers } from "@/hooks/useSuppliers";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { logAction } from "@/services/ActionLogger";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { parseNFeXML, validateDestCnpj, type NFeInfo, type NFeProduct, type NFeDestInfo } from "./nfe-xml-parser";

type Step = "upload" | "processing" | "results" | "done";

interface ImportResult {
  imported: number;
  updated: number;
  errors: number;
  noNcm: number;
  lowMarginProducts: string[];
  fiscalAdjustments: number;
}

const PROCESSING_MESSAGES = [
  { text: "Lendo nota fiscal...", icon: FileSearch, duration: 800 },
  { text: "Identificando produtos...", icon: Package, duration: 1000 },
  { text: "Verificando estoque existente...", icon: BarChart3, duration: 1200 },
  { text: "Aplicando regras fiscais...", icon: ShieldCheck, duration: 1000 },
  { text: "Preparando importação...", icon: Sparkles, duration: 600 },
];

export default function SmartNFeImport() {
  const { companyId, cnpj: companyCnpj } = useCompany();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: suppliers = [] } = useSuppliers();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [nfeInfo, setNfeInfo] = useState<NFeInfo | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult>({ imported: 0, updated: 0, errors: 0, noNcm: 0, lowMarginProducts: [], fiscalAdjustments: 0 });
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [processingStep, setProcessingStep] = useState(0);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [showAiExplanation, setShowAiExplanation] = useState(false);
  const [aiExplanation, setAiExplanation] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Supplier state
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplierStatus, setSupplierStatus] = useState<"checking" | "found" | "not_found" | "created">("checking");
  const [creatingSupplier, setCreatingSupplier] = useState(false);

  const reset = () => {
    setStep("upload");
    setNfeInfo(null);
    setResult({ imported: 0, updated: 0, errors: 0, noNcm: 0, lowMarginProducts: [], fiscalAdjustments: 0 });
    setEditingIndex(null);
    setProcessingStep(0);
    setProcessingProgress(0);
    setShowAiExplanation(false);
    setAiExplanation("");
    setSupplierId(null);
    setSupplierStatus("checking");
  };

  // Detect supplier
  useEffect(() => {
    if (step !== "results" || !nfeInfo?.supplierCnpj) {
      setSupplierStatus("checking");
      return;
    }
    const cnpjClean = nfeInfo.supplierCnpj.replace(/\D/g, "");
    const found = (suppliers as { id: string; cnpj?: string | null }[]).find(
      (s) => (s.cnpj || "").replace(/\D/g, "") === cnpjClean
    );
    if (found) {
      setSupplierId(found.id);
      setSupplierStatus("found");
    } else {
      setSupplierId(null);
      setSupplierStatus("not_found");
    }
  }, [step, nfeInfo?.supplierCnpj, suppliers]);

  // Check existing products by barcode
  const enrichWithStockData = useCallback(async (info: NFeInfo) => {
    if (!companyId) return info;
    const barcodes = info.products.map((p) => p.barcode).filter(Boolean);
    if (barcodes.length === 0) return info;

    const { data: existing } = await supabase
      .from("products")
      .select("id, barcode, stock_quantity, price")
      .eq("company_id", companyId)
      .in("barcode", barcodes);

    if (existing && existing.length > 0) {
      const updatedProducts = info.products.map((p) => {
        if (!p.barcode) return p;
        const match = existing.find((e) => e.barcode === p.barcode);
        if (match) {
          return {
            ...p,
            existingProductId: match.id,
            currentStock: match.stock_quantity || 0,
            salePrice: match.price || p.salePrice,
            status: "updated" as const,
          };
        }
        return p;
      });
      return { ...info, products: updatedProducts };
    }
    return info;
  }, [companyId]);

  // Simulated smart processing animation
  const runProcessingAnimation = useCallback(async (info: NFeInfo) => {
    setStep("processing");
    for (let i = 0; i < PROCESSING_MESSAGES.length; i++) {
      setProcessingStep(i);
      setProcessingProgress(((i + 1) / PROCESSING_MESSAGES.length) * 100);
      await new Promise((r) => setTimeout(r, PROCESSING_MESSAGES[i].duration));
    }
    const enriched = await enrichWithStockData(info);
    setNfeInfo(enriched);
    setStep("results");
  }, [enrichWithStockData]);

  // File handling
  const processXml = useCallback(async (text: string) => {
    const parsed = parseNFeXML(text);
    if (!parsed || parsed.products.length === 0) {
      toast.error("Arquivo XML inválido ou sem produtos");
      return;
    }
    const cnpjError = validateDestCnpj(parsed, companyCnpj);
    if (cnpjError) {
      toast.error(cnpjError);
      return;
    }
    // Check duplicate
    if (parsed.accessKey && companyId) {
      const { data: existing } = await supabase
        .from("nfe_imports")
        .select("id, imported_at")
        .eq("company_id", companyId)
        .eq("access_key", parsed.accessKey)
        .maybeSingle();
      if (existing) {
        const importedDate = new Date(existing.imported_at).toLocaleDateString("pt-BR");
        toast.error(`Esta NF-e já foi importada em ${importedDate}. Importação bloqueada.`);
        return;
      }
    }
    runProcessingAnimation(parsed);
  }, [companyCnpj, companyId, runProcessingAnimation]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => processXml(ev.target?.result as string);
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file || !file.name.endsWith(".xml")) {
      toast.error("Por favor, envie um arquivo .xml");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => processXml(ev.target?.result as string);
    reader.readAsText(file, "UTF-8");
  }, [processXml]);

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
      toast.success("Fornecedor cadastrado!");
    } catch (err) {
      toast.error("Erro ao cadastrar fornecedor: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setCreatingSupplier(false);
    }
  };

  const updateProduct = useCallback((index: number, field: keyof NFeProduct, value: string | number | boolean) => {
    setNfeInfo((prev) => {
      if (!prev) return prev;
      const products = [...prev.products];
      const p = { ...products[index] };
      if (field === "name") p.name = value as string;
      else if (field === "ncm") { p.ncm = value as string; p.fiscalNotes = p.fiscalNotes.filter(n => n !== "NCM ausente"); if (!value) p.fiscalNotes.push("NCM ausente"); p.fiscalStatus = p.fiscalNotes.length > 0 ? "review" : "ok"; }
      else if (field === "unitPrice") { p.unitPrice = Number(value) || 0; p.totalPrice = p.quantity * p.unitPrice; p.salePrice = parseFloat((p.unitPrice * (1 + p.margin / 100)).toFixed(2)); }
      else if (field === "unit") p.unit = (value as string).toUpperCase();
      else if (field === "margin") { p.margin = Number(value) || 0; p.salePrice = parseFloat((p.unitPrice * (1 + p.margin / 100)).toFixed(2)); }
      else if (field === "salePrice") { p.salePrice = Number(value) || 0; p.margin = p.unitPrice > 0 ? parseFloat((((p.salePrice / p.unitPrice) - 1) * 100).toFixed(1)) : 0; }
      else if (field === "confirmed") p.confirmed = value as boolean;
      p.valid = !!p.name && p.unitPrice > 0;
      p.error = !p.name ? "Nome vazio" : p.unitPrice <= 0 ? "Preço unitário inválido" : undefined;
      products[index] = p;
      return { ...prev, products };
    });
  }, []);

  const removeProduct = useCallback((index: number) => {
    setNfeInfo((prev) => {
      if (!prev) return prev;
      return { ...prev, products: prev.products.filter((_, i) => i !== index) };
    });
    setEditingIndex(null);
  }, []);

  // Import logic
  const handleImport = async (onlyConfirmed = false) => {
    if (!companyId || !nfeInfo) return;
    setImporting(true);
    const products = onlyConfirmed ? nfeInfo.products.filter((p) => p.confirmed && p.valid) : nfeInfo.products.filter((p) => p.valid);
    let imported = 0, errors = 0, updated = 0;
    const lowMarginProducts: string[] = [];
    let fiscalAdjustments = 0;
    let noNcm = 0;

    for (const p of products) {
      if (!p.ncm) noNcm++;
      if (p.margin < 15) lowMarginProducts.push(p.name);
      if (p.fiscalNotes.length > 0) fiscalAdjustments++;

      if (p.barcode) {
        const { data: existing } = await supabase
          .from("products")
          .select("id, stock_quantity, cost_price, price")
          .eq("company_id", companyId)
          .eq("barcode", p.barcode)
          .limit(1)
          .maybeSingle();

        if (existing) {
          const previousStock = existing.stock_quantity || 0;
          const newStock = previousStock + p.quantity;
          const updateData: Record<string, unknown> = { stock_quantity: newStock, cost_price: p.unitPrice, price: p.salePrice };
          if (supplierId) updateData.supplier_id = supplierId;

          const { error } = await supabase.from("products").update(updateData).eq("id", existing.id);
          if (error) { errors++; continue; }
          updated++;

          await supabase.from("stock_movements").insert({
            company_id: companyId, product_id: existing.id, type: "entrada",
            quantity: p.quantity, previous_stock: previousStock, new_stock: newStock,
            unit_cost: p.unitPrice, reason: `Importação NF-e ${nfeInfo.number || ""}`.trim(),
            reference: nfeInfo.accessKey || null, performed_by: user?.id || null, acquisition_type: "cnpj",
          });

          const changes: Array<{ company_id: string; product_id: string; field_changed: "price" | "cost_price"; old_value: number; new_value: number; changed_by?: string | null; source: "xml_import" }> = [];
          if (p.unitPrice !== (existing.cost_price ?? 0)) changes.push({ company_id: companyId!, product_id: existing.id, field_changed: "cost_price", old_value: existing.cost_price ?? 0, new_value: p.unitPrice, changed_by: user?.id, source: "xml_import" });
          if (p.salePrice !== (existing.price ?? 0)) changes.push({ company_id: companyId!, product_id: existing.id, field_changed: "price", old_value: existing.price ?? 0, new_value: p.salePrice, changed_by: user?.id, source: "xml_import" });
          if (changes.length > 0) recordPriceChanges(changes);
          continue;
        }
      }

      const autoSku = `NFE-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const insertData: Record<string, unknown> = {
        name: p.name, sku: autoSku, barcode: p.barcode || null, ncm: p.ncm || null,
        price: p.salePrice, cost_price: p.unitPrice, stock_quantity: p.quantity,
        unit: p.unit, company_id: companyId, is_active: true,
      };
      if (supplierId) insertData.supplier_id = supplierId;

      const { data: newProduct, error } = await supabase.from("products").insert(insertData).select("id").single();
      if (error) { errors++; continue; }
      imported++;

      await supabase.from("stock_movements").insert({
        company_id: companyId, product_id: newProduct.id, type: "entrada",
        quantity: p.quantity, previous_stock: 0, new_stock: p.quantity,
        unit_cost: p.unitPrice, reason: `Importação NF-e ${nfeInfo.number || ""}`.trim(),
        reference: nfeInfo.accessKey || null, performed_by: user?.id || null, acquisition_type: "cnpj",
      });
    }

    // Record NF-e import
    if (nfeInfo.accessKey && (imported + updated) > 0) {
      await supabase.from("nfe_imports").insert({
        company_id: companyId, access_key: nfeInfo.accessKey, nfe_number: nfeInfo.number,
        nfe_series: nfeInfo.series || null, nfe_model: nfeInfo.series ? "55-NFe" : null,
        supplier_name: nfeInfo.supplierName, supplier_cnpj: nfeInfo.supplierCnpj,
        total_value: nfeInfo.totalValue, products_count: imported + updated,
        imported_by: user?.id || null, status: "pendente",
      } as Record<string, unknown>);
    }

    setResult({ imported, updated, errors, noNcm, lowMarginProducts, fiscalAdjustments });
    setStep("done");
    setImporting(false);
    queryClient.invalidateQueries({ queryKey: ["products"] });
    if (imported + updated > 0) {
      logAction({ companyId: companyId!, userId: user?.id, action: "Importação Inteligente NF-e", module: "estoque", details: `${imported} novo(s), ${updated} atualizado(s), ${errors} erro(s) - NF ${nfeInfo?.number || ""}` });
      toast.success(`Importação concluída: ${imported} novo(s), ${updated} atualizado(s)!`);
    }
    if (errors > 0) toast.error(`${errors} produto(s) com erro`);
  };

  // AI Explanation
  const generateAiExplanation = async () => {
    if (!nfeInfo) return;
    setAiLoading(true);
    setShowAiExplanation(true);

    const confirmedProducts = nfeInfo.products.filter((p) => p.confirmed);
    const newProducts = confirmedProducts.filter((p) => p.status === "new");
    const updatedProducts = confirmedProducts.filter((p) => p.status === "updated");
    const noNcmProducts = confirmedProducts.filter((p) => !p.ncm);
    const lowMarginProducts = confirmedProducts.filter((p) => p.margin < 15);
    const totalValue = confirmedProducts.reduce((sum, p) => sum + p.totalPrice, 0);

    // Generate local explanation (no API needed)
    const lines: string[] = [];
    lines.push(`📋 **Resumo da Importação da NF-e ${nfeInfo.number || ""}**\n`);
    lines.push(`Fornecedor: **${nfeInfo.supplierName}** (CNPJ: ${nfeInfo.supplierCnpj})`);
    lines.push(`Data de emissão: ${nfeInfo.issueDate ? new Date(nfeInfo.issueDate + "T12:00:00").toLocaleDateString("pt-BR") : "—"}`);
    lines.push(`Valor total da nota: **R$ ${totalValue.toFixed(2).replace(".", ",")}**\n`);

    lines.push(`### Produtos`);
    lines.push(`- **${confirmedProducts.length}** produtos identificados na nota`);
    if (newProducts.length > 0) lines.push(`- **${newProducts.length}** serão cadastrados como novos no sistema`);
    if (updatedProducts.length > 0) lines.push(`- **${updatedProducts.length}** já existem e terão o estoque atualizado`);
    lines.push("");

    if (noNcmProducts.length > 0) {
      lines.push(`### ⚠️ Atenção Fiscal`);
      lines.push(`- **${noNcmProducts.length}** produto(s) estão sem NCM: ${noNcmProducts.map((p) => `"${p.name}"`).join(", ")}`);
      lines.push(`- Recomendação: preencha o NCM antes de emitir NFC-e para evitar rejeição da SEFAZ.\n`);
    }

    if (lowMarginProducts.length > 0) {
      lines.push(`### 💡 Insights de Margem`);
      lines.push(`- **${lowMarginProducts.length}** produto(s) com margem abaixo de 15%: ${lowMarginProducts.map((p) => `"${p.name}" (${p.margin}%)`).join(", ")}`);
      lines.push(`- Considere ajustar o preço de venda para manter a rentabilidade.\n`);
    }

    if (updatedProducts.length > 0) {
      lines.push(`### 📦 Atualização de Estoque`);
      for (const p of updatedProducts.slice(0, 5)) {
        lines.push(`- **${p.name}**: +${p.quantity} ${p.unit} (estoque atual: ${p.currentStock || 0})`);
      }
      if (updatedProducts.length > 5) lines.push(`- ...e mais ${updatedProducts.length - 5} produto(s)`);
    }

    lines.push(`\n---\n✅ Todas as movimentações de estoque serão registradas com origem fiscal (CNPJ), garantindo lastro para emissão de NFC-e.`);

    setAiExplanation(lines.join("\n"));
    setAiLoading(false);
  };

  const formatCurrency = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

  // Computed stats
  const validCount = nfeInfo?.products.filter((p) => p.valid).length || 0;
  const confirmedCount = nfeInfo?.products.filter((p) => p.confirmed && p.valid).length || 0;
  const existingCount = nfeInfo?.products.filter((p) => p.existingProductId).length || 0;
  const newCount = validCount - existingCount;
  const noNcmCount = nfeInfo?.products.filter((p) => !p.ncm).length || 0;
  const lowMarginCount = nfeInfo?.products.filter((p) => p.margin < 15).length || 0;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            Importação Inteligente de NF-e
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Importe sua NF-e e deixe o sistema organizar tudo automaticamente
          </p>
        </div>
        {step !== "upload" && (
          <Button variant="outline" size="sm" onClick={reset}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Nova importação
          </Button>
        )}
      </div>

      {/* STEP: Upload */}
      <AnimatePresence mode="wait">
        {step === "upload" && (
          <motion.div
            key="upload"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <Card className="border-dashed border-2 hover:border-primary/50 transition-colors">
              <CardContent className="pt-6">
                <div
                  ref={dropRef}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`text-center py-16 cursor-pointer rounded-xl transition-all ${dragOver ? "bg-primary/10 scale-[1.01]" : "hover:bg-muted/30"}`}
                >
                  <motion.div
                    animate={{ y: dragOver ? -8 : 0 }}
                    transition={{ type: "spring", stiffness: 300 }}
                  >
                    <Upload className={`w-16 h-16 mx-auto mb-4 ${dragOver ? "text-primary" : "text-muted-foreground/50"}`} />
                  </motion.div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    Arraste o XML da NF-e aqui
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    ou clique para selecionar o arquivo
                  </p>
                  <Badge variant="outline" className="text-xs">Aceita apenas .xml (NF-e padrão SEFAZ)</Badge>
                </div>
                <input ref={fileInputRef} type="file" accept=".xml" onChange={handleFile} className="hidden" />
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* STEP: Processing */}
        {step === "processing" && (
          <motion.div
            key="processing"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <Card>
              <CardContent className="py-16">
                <div className="max-w-md mx-auto text-center space-y-6">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                    className="inline-block"
                  >
                    <Sparkles className="w-12 h-12 text-primary" />
                  </motion.div>
                  <div className="space-y-3">
                    <AnimatePresence mode="wait">
                      {PROCESSING_MESSAGES.map((msg, i) => (
                        processingStep === i && (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="flex items-center justify-center gap-3"
                          >
                            <msg.icon className="w-5 h-5 text-primary" />
                            <span className="text-foreground font-medium">{msg.text}</span>
                          </motion.div>
                        )
                      ))}
                    </AnimatePresence>
                  </div>
                  <Progress value={processingProgress} className="h-2" />
                  <p className="text-xs text-muted-foreground">Processando automaticamente...</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* STEP: Results */}
        {step === "results" && nfeInfo && (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {/* NF-e Header Info */}
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground text-xs">NF-e</span>
                      <p className="font-semibold text-foreground">{nfeInfo.number || "—"}{nfeInfo.series ? ` / S${nfeInfo.series}` : ""}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Fornecedor</span>
                      <p className="font-semibold text-foreground truncate">{nfeInfo.supplierName}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Emissão</span>
                      <p className="font-semibold text-foreground">{nfeInfo.issueDate ? new Date(nfeInfo.issueDate + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Valor Total</span>
                      <p className="font-semibold text-foreground">{formatCurrency(nfeInfo.totalValue)}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Smart Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="pt-4 pb-3 text-center">
                  <Package className="w-6 h-6 text-primary mx-auto mb-1" />
                  <p className="text-2xl font-bold text-foreground">{validCount}</p>
                  <p className="text-xs text-muted-foreground">Produtos processados</p>
                </CardContent>
              </Card>
              <Card className="border-green-500/20 bg-green-500/5">
                <CardContent className="pt-4 pb-3 text-center">
                  <Plus className="w-6 h-6 text-green-500 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-foreground">{newCount}</p>
                  <p className="text-xs text-muted-foreground">Novos</p>
                </CardContent>
              </Card>
              <Card className="border-blue-500/20 bg-blue-500/5">
                <CardContent className="pt-4 pb-3 text-center">
                  <RefreshCw className="w-6 h-6 text-blue-500 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-foreground">{existingCount}</p>
                  <p className="text-xs text-muted-foreground">Atualizados</p>
                </CardContent>
              </Card>
              <Card className="border-amber-500/20 bg-amber-500/5">
                <CardContent className="pt-4 pb-3 text-center">
                  <ShieldCheck className="w-6 h-6 text-amber-500 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-foreground">{validCount - noNcmCount}/{validCount}</p>
                  <p className="text-xs text-muted-foreground">Fiscal OK</p>
                </CardContent>
              </Card>
            </div>

            {/* Alerts & Suggestions */}
            {(noNcmCount > 0 || lowMarginCount > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {noNcmCount > 0 && (
                  <Card className="border-amber-500/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2 text-amber-600">
                        <AlertTriangle className="w-4 h-4" />
                        Alertas Fiscais
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pb-3">
                      <p className="text-xs text-muted-foreground">
                        <strong>{noNcmCount}</strong> produto(s) sem NCM. Preencha antes de emitir NFC-e.
                      </p>
                    </CardContent>
                  </Card>
                )}
                {lowMarginCount > 0 && (
                  <Card className="border-primary/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2 text-primary">
                        <Lightbulb className="w-4 h-4" />
                        Sugestões Inteligentes
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pb-3">
                      <p className="text-xs text-muted-foreground">
                        <strong>{lowMarginCount}</strong> produto(s) com margem abaixo de 15%. Considere ajustar o preço de venda.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Supplier */}
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Factory className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">Fornecedor</span>
                  </div>
                  {supplierStatus === "found" && (
                    <Badge variant="default" className="text-xs"><CheckCircle2 className="w-3 h-3 mr-1" /> Cadastrado</Badge>
                  )}
                  {supplierStatus === "created" && (
                    <Badge variant="default" className="text-xs"><CheckCircle2 className="w-3 h-3 mr-1" /> Cadastrado agora</Badge>
                  )}
                  {supplierStatus === "not_found" && (
                    <Button variant="outline" size="sm" onClick={handleCreateSupplier} disabled={creatingSupplier}>
                      {creatingSupplier ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
                      Cadastrar fornecedor
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Products Table */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    Produtos ({confirmedCount} selecionados)
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => setNfeInfo((prev) => prev ? { ...prev, products: prev.products.map((p) => ({ ...p, confirmed: true })) } : prev)}
                    >
                      Selecionar todos
                    </Button>
                    {/* Batch margin */}
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number" step="0.1" placeholder="Margem %"
                        className="w-20 bg-background border border-border rounded px-2 py-1 text-xs text-foreground font-mono text-right"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const val = parseFloat((e.target as HTMLInputElement).value);
                            if (!isNaN(val) && nfeInfo) {
                              setNfeInfo((prev) => {
                                if (!prev) return prev;
                                return { ...prev, products: prev.products.map((p) => ({ ...p, margin: val, salePrice: parseFloat((p.unitPrice * (1 + val / 100)).toFixed(2)) })) };
                              });
                              toast.success(`Margem de ${val}% aplicada`);
                            }
                          }
                        }}
                      />
                    </div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="border border-border rounded-lg overflow-x-auto max-h-96">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0 z-10">
                      <tr>
                        <th className="px-2 py-2.5 text-left w-8">
                          <input
                            type="checkbox"
                            checked={confirmedCount === validCount}
                            onChange={(e) => setNfeInfo((prev) => prev ? { ...prev, products: prev.products.map((p) => ({ ...p, confirmed: e.target.checked })) } : prev)}
                            className="rounded border-border"
                          />
                        </th>
                        <th className="px-2 py-2.5 text-left text-muted-foreground">Produto</th>
                        <th className="px-2 py-2.5 text-center text-muted-foreground w-20">Tipo</th>
                        <th className="px-2 py-2.5 text-right text-muted-foreground w-14">Qtd</th>
                        <th className="px-2 py-2.5 text-right text-muted-foreground w-20">Custo</th>
                        <th className="px-2 py-2.5 text-right text-muted-foreground w-16">Margem</th>
                        <th className="px-2 py-2.5 text-right text-muted-foreground w-20">Venda</th>
                        <th className="px-2 py-2.5 text-center text-muted-foreground w-20">Fiscal</th>
                        <th className="px-2 py-2.5 text-center text-muted-foreground w-16">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nfeInfo.products.map((p, i) => (
                        <tr
                          key={i}
                          className={`border-t border-border transition-colors ${!p.valid ? "bg-destructive/5" : ""} ${editingIndex === i ? "bg-primary/5" : ""} ${p.existingProductId ? "bg-accent/20" : ""} ${!p.confirmed ? "opacity-50" : ""}`}
                        >
                          <td className="px-2 py-1.5">
                            <input
                              type="checkbox"
                              checked={p.confirmed}
                              onChange={(e) => updateProduct(i, "confirmed", e.target.checked)}
                              className="rounded border-border"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            {editingIndex === i ? (
                              <input value={p.name} onChange={(e) => updateProduct(i, "name", e.target.value)}
                                className="w-full bg-background border border-border rounded px-1.5 py-0.5 text-xs text-foreground" />
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="text-foreground truncate block max-w-[200px]">{p.name}</span>
                                {p.existingProductId && (
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">Est: {p.currentStock}</Badge>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <Badge variant={p.existingProductId ? "secondary" : "outline"} className="text-[10px]">
                              {p.existingProductId ? "Atualizado" : "Novo"}
                            </Badge>
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-foreground">{p.quantity}</td>
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
                              <span className={`font-mono ${p.margin < 15 ? "text-amber-500" : "text-muted-foreground"}`}>{p.margin}%</span>
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
                          <td className="px-2 py-1.5 text-center">
                            {p.fiscalStatus === "ok" ? (
                              <Badge variant="default" className="text-[10px] bg-green-600"><CheckCircle2 className="w-3 h-3 mr-0.5" />OK</Badge>
                            ) : (
                              <Badge variant="destructive" className="text-[10px]"><AlertCircle className="w-3 h-3 mr-0.5" />Revisar</Badge>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <div className="flex items-center justify-center gap-0.5">
                              <button
                                onClick={() => setEditingIndex(editingIndex === i ? null : i)}
                                className={`p-1 rounded hover:bg-accent transition-colors ${editingIndex === i ? "text-primary" : "text-muted-foreground"}`}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => removeProduct(i)}
                                className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* AI Explanation */}
            {showAiExplanation && (
              <Card className="border-primary/30 bg-primary/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span className="flex items-center gap-2 text-primary">
                      <Brain className="w-4 h-4" />
                      Explicação da Importação
                    </span>
                    <button onClick={() => setShowAiExplanation(false)} className="text-muted-foreground hover:text-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                  {aiLoading ? (
                    <div className="flex items-center gap-2 py-4">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <span className="text-sm text-muted-foreground">Gerando explicação...</span>
                    </div>
                  ) : (
                    <div className="prose prose-sm dark:prose-invert max-w-none text-xs whitespace-pre-line">
                      {aiExplanation.split("\n").map((line, i) => {
                        if (line.startsWith("### ")) return <h4 key={i} className="text-sm font-semibold mt-3 mb-1 text-foreground">{line.replace("### ", "")}</h4>;
                        if (line.startsWith("## ")) return <h3 key={i} className="text-base font-bold mt-4 mb-1 text-foreground">{line.replace("## ", "")}</h3>;
                        if (line.startsWith("- ")) return <p key={i} className="ml-3 text-muted-foreground">{line}</p>;
                        if (line.trim() === "---") return <hr key={i} className="my-2 border-border" />;
                        return <p key={i} className="text-muted-foreground">{line.replace(/\*\*(.*?)\*\*/g, (_, t) => t)}</p>;
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <Button
                onClick={() => handleImport(false)}
                disabled={importing || validCount === 0}
                className="flex-1 sm:flex-none"
              >
                {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                {importing ? "Importando..." : `Confirmar tudo (${validCount})`}
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleImport(true)}
                disabled={importing || confirmedCount === 0}
                className="flex-1 sm:flex-none"
              >
                <Eye className="w-4 h-4 mr-2" />
                Importar selecionados ({confirmedCount})
              </Button>
              {!showAiExplanation && (
                <Button
                  variant="outline"
                  onClick={generateAiExplanation}
                  disabled={aiLoading}
                  className="flex-1 sm:flex-none border-primary/30 text-primary hover:bg-primary/10"
                >
                  <Brain className="w-4 h-4 mr-2" />
                  Explicar importação
                </Button>
              )}
              <Button variant="ghost" onClick={reset} className="flex-1 sm:flex-none">
                Cancelar
              </Button>
            </div>
          </motion.div>
        )}

        {/* STEP: Done */}
        {step === "done" && (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-6"
          >
            <Card className="border-green-500/30 bg-green-500/5">
              <CardContent className="py-12 text-center space-y-4">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                >
                  <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
                </motion.div>
                <h2 className="text-xl font-bold text-foreground">Importação concluída!</h2>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  {result.imported > 0 && `${result.imported} produto(s) novo(s) cadastrado(s)`}
                  {result.imported > 0 && result.updated > 0 && ", "}
                  {result.updated > 0 && `${result.updated} atualizado(s)`}
                  {result.errors > 0 ? `, ${result.errors} com erro` : ""}.
                </p>
              </CardContent>
            </Card>

            {/* Result summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4 pb-3 text-center">
                  <p className="text-2xl font-bold text-green-500">{result.imported}</p>
                  <p className="text-xs text-muted-foreground">Novos cadastrados</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 text-center">
                  <p className="text-2xl font-bold text-blue-500">{result.updated}</p>
                  <p className="text-xs text-muted-foreground">Estoque atualizado</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 text-center">
                  <p className="text-2xl font-bold text-amber-500">{result.noNcm}</p>
                  <p className="text-xs text-muted-foreground">Sem NCM</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 text-center">
                  <p className="text-2xl font-bold text-destructive">{result.errors}</p>
                  <p className="text-xs text-muted-foreground">Erros</p>
                </CardContent>
              </Card>
            </div>

            {/* Suggestions after import */}
            {(result.lowMarginProducts.length > 0 || result.noNcm > 0) && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-primary" />
                    Sugestões pós-importação
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4 space-y-2">
                  {result.lowMarginProducts.length > 0 && (
                    <div className="flex items-start gap-2 text-xs text-muted-foreground">
                      <TrendingDown className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <span>
                        <strong>{result.lowMarginProducts.length}</strong> produto(s) com margem baixa: {result.lowMarginProducts.slice(0, 3).join(", ")}
                        {result.lowMarginProducts.length > 3 ? ` e mais ${result.lowMarginProducts.length - 3}` : ""}
                      </span>
                    </div>
                  )}
                  {result.noNcm > 0 && (
                    <div className="flex items-start gap-2 text-xs text-muted-foreground">
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <span>
                        <strong>{result.noNcm}</strong> produto(s) sem NCM. Acesse o cadastro de produtos para preencher.
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="flex items-center gap-3">
              <Button onClick={reset}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Nova importação
              </Button>
              <Button variant="outline" onClick={() => window.location.href = "/produtos"}>
                <ArrowRight className="w-4 h-4 mr-2" />
                Ver produtos
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
