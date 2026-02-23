import { useState, useCallback } from "react";
import {
  FileText,
  Upload,
  ArrowLeftRight,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Package,
} from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface NFItem {
  nItem: string;
  cProd: string;
  xProd: string;
  NCM: string;
  CFOP: string;
  uCom: string;
  qCom: number;
  vUnCom: number;
  vProd: number;
}

interface NFData {
  fileName: string;
  chaveAcesso: string;
  nNF: string;
  dhEmi: string;
  emitente: { CNPJ: string; xNome: string; UF: string };
  destinatario: { CNPJ: string; xNome: string; UF: string };
  items: NFItem[];
  vNF: number;
  vICMS: number;
  vPIS: number;
  vCOFINS: number;
  vIPI: number;
}

function parseNFXml(xmlText: string, fileName: string): NFData {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");

  const txt = (parent: Element | Document, tag: string): string => {
    const el = parent.getElementsByTagName(tag);
    return el.length > 0 ? el[0].textContent?.trim() || "" : "";
  };

  const num = (parent: Element | Document, tag: string): number =>
    parseFloat(txt(parent, tag)) || 0;

  const ide = doc.getElementsByTagName("ide")[0];
  const emit = doc.getElementsByTagName("emit")[0];
  const dest = doc.getElementsByTagName("dest")[0];
  const total = doc.getElementsByTagName("ICMSTot")[0];
  const protNFe = doc.getElementsByTagName("protNFe")[0];
  const chave = protNFe ? txt(protNFe, "chNFe") : txt(doc, "chNFe");

  const detNodes = doc.getElementsByTagName("det");
  const items: NFItem[] = [];
  for (let i = 0; i < detNodes.length; i++) {
    const det = detNodes[i];
    const prod = det.getElementsByTagName("prod")[0];
    if (!prod) continue;
    items.push({
      nItem: det.getAttribute("nItem") || String(i + 1),
      cProd: txt(prod, "cProd"),
      xProd: txt(prod, "xProd"),
      NCM: txt(prod, "NCM"),
      CFOP: txt(prod, "CFOP"),
      uCom: txt(prod, "uCom"),
      qCom: num(prod, "qCom"),
      vUnCom: num(prod, "vUnCom"),
      vProd: num(prod, "vProd"),
    });
  }

  return {
    fileName,
    chaveAcesso: chave,
    nNF: txt(ide || doc, "nNF"),
    dhEmi: txt(ide || doc, "dhEmi"),
    emitente: {
      CNPJ: txt(emit || doc, "CNPJ"),
      xNome: emit ? txt(emit, "xNome") : "",
      UF: emit ? txt(emit, "UF") : "",
    },
    destinatario: {
      CNPJ: dest ? txt(dest, "CNPJ") : "",
      xNome: dest ? txt(dest, "xNome") : "",
      UF: dest ? txt(dest, "UF") : "",
    },
    items,
    vNF: num(total || doc, "vNF"),
    vICMS: num(total || doc, "vICMS"),
    vPIS: num(total || doc, "vPIS"),
    vCOFINS: num(total || doc, "vCOFINS"),
    vIPI: num(total || doc, "vIPI"),
  };
}

interface ComparisonResult {
  field: string;
  compra: string;
  venda: string;
  match: boolean;
}

interface ItemDiff {
  cProd: string;
  xProd: string;
  status: "match" | "qty_diff" | "price_diff" | "both_diff" | "only_compra" | "only_venda";
  compraQty?: number;
  vendaQty?: number;
  compraPrice?: number;
  vendaPrice?: number;
}

function compareNFs(compra: NFData, venda: NFData) {
  const fields: ComparisonResult[] = [
    { field: "Nº NF", compra: compra.nNF, venda: venda.nNF, match: compra.nNF === venda.nNF },
    { field: "Valor Total", compra: fmt(compra.vNF), venda: fmt(venda.vNF), match: compra.vNF === venda.vNF },
    { field: "ICMS", compra: fmt(compra.vICMS), venda: fmt(venda.vICMS), match: compra.vICMS === venda.vICMS },
    { field: "PIS", compra: fmt(compra.vPIS), venda: fmt(venda.vPIS), match: compra.vPIS === venda.vPIS },
    { field: "COFINS", compra: fmt(compra.vCOFINS), venda: fmt(venda.vCOFINS), match: compra.vCOFINS === venda.vCOFINS },
    { field: "IPI", compra: fmt(compra.vIPI), venda: fmt(venda.vIPI), match: compra.vIPI === venda.vIPI },
    { field: "Qtd. Itens", compra: String(compra.items.length), venda: String(venda.items.length), match: compra.items.length === venda.items.length },
  ];

  const itemDiffs: ItemDiff[] = [];
  const compraMap = new Map(compra.items.map((i) => [i.cProd, i]));
  const vendaMap = new Map(venda.items.map((i) => [i.cProd, i]));
  const allCodes = new Set([...compraMap.keys(), ...vendaMap.keys()]);

  for (const code of allCodes) {
    const c = compraMap.get(code);
    const v = vendaMap.get(code);
    if (c && v) {
      const qtyMatch = c.qCom === v.qCom;
      const priceMatch = Math.abs(c.vUnCom - v.vUnCom) < 0.01;
      let status: ItemDiff["status"] = "match";
      if (!qtyMatch && !priceMatch) status = "both_diff";
      else if (!qtyMatch) status = "qty_diff";
      else if (!priceMatch) status = "price_diff";
      itemDiffs.push({
        cProd: code,
        xProd: c.xProd || v.xProd,
        status,
        compraQty: c.qCom,
        vendaQty: v.qCom,
        compraPrice: c.vUnCom,
        vendaPrice: v.vUnCom,
      });
    } else if (c) {
      itemDiffs.push({ cProd: code, xProd: c.xProd, status: "only_compra", compraQty: c.qCom, compraPrice: c.vUnCom });
    } else if (v) {
      itemDiffs.push({ cProd: code, xProd: v.xProd, status: "only_venda", vendaQty: v.qCom, vendaPrice: v.vUnCom });
    }
  }

  return { fields, itemDiffs };
}

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function DropZone({ label, onFile, data }: { label: string; onFile: (d: NFData) => void; data: NFData | null }) {
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) readFile(file, onFile);
    },
    [onFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) readFile(file, onFile);
    },
    [onFile]
  );

  return (
    <Card
      className="flex-1 border-dashed border-2 hover:border-primary/50 transition-colors"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <FileText className="w-4 h-4" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data ? (
          <div className="space-y-1 text-sm">
            <p className="font-medium text-foreground truncate">{data.fileName}</p>
            <p className="text-muted-foreground">NF nº {data.nNF} — {data.items.length} itens</p>
            <p className="text-muted-foreground">{data.emitente.xNome}</p>
            <p className="font-semibold text-foreground">{fmt(data.vNF)}</p>
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center py-6 cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
            <Upload className="w-8 h-8 mb-2 opacity-50" />
            <span className="text-sm">Arraste o XML ou clique para selecionar</span>
            <input type="file" accept=".xml" className="hidden" onChange={handleChange} />
          </label>
        )}
      </CardContent>
    </Card>
  );
}

function readFile(file: File, onResult: (d: NFData) => void) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target?.result as string;
    try {
      const data = parseNFXml(text, file.name);
      onResult(data);
    } catch (err) {
      console.error("Erro ao parsear XML:", err);
    }
  };
  reader.readAsText(file);
}

const statusLabels: Record<ItemDiff["status"], { label: string; variant: "default" | "destructive" | "secondary" | "outline" }> = {
  match: { label: "OK", variant: "default" },
  qty_diff: { label: "Qtd. diferente", variant: "destructive" },
  price_diff: { label: "Preço diferente", variant: "destructive" },
  both_diff: { label: "Qtd + Preço dif.", variant: "destructive" },
  only_compra: { label: "Só na compra", variant: "secondary" },
  only_venda: { label: "Só na venda", variant: "secondary" },
};

export default function CompararXML() {
  const [compra, setCompra] = useState<NFData | null>(null);
  const [venda, setVenda] = useState<NFData | null>(null);

  const comparison = compra && venda ? compareNFs(compra, venda) : null;
  const totalDiffs = comparison ? comparison.fields.filter((f) => !f.match).length + comparison.itemDiffs.filter((i) => i.status !== "match").length : 0;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Comparar XML</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Compare o XML de compra (fornecedor) com o XML de venda para identificar divergências
        </p>
      </div>

      {/* Upload Area */}
      <div className="flex gap-4 items-stretch">
        <DropZone label="XML de Compra (NF-e entrada)" onFile={setCompra} data={compra} />
        <div className="flex items-center">
          <ArrowLeftRight className="w-6 h-6 text-muted-foreground" />
        </div>
        <DropZone label="XML de Venda (NF-e saída)" onFile={setVenda} data={venda} />
      </div>

      {compra && venda && (
        <Button variant="outline" size="sm" onClick={() => { setCompra(null); setVenda(null); }}>
          Limpar e comparar outros
        </Button>
      )}

      {/* Results */}
      {comparison && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* Summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                {totalDiffs === 0 ? (
                  <><CheckCircle className="w-5 h-5 text-success" /> Nenhuma divergência encontrada</>
                ) : (
                  <><AlertTriangle className="w-5 h-5 text-warning" /> {totalDiffs} divergência(s) encontrada(s)</>
                )}
              </CardTitle>
            </CardHeader>
          </Card>

          {/* Field Comparison */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Totais e Impostos</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-4 text-xs font-medium text-muted-foreground px-4 py-2 border-b border-border bg-muted/30">
                <span>Campo</span>
                <span>Compra</span>
                <span>Venda</span>
                <span>Status</span>
              </div>
              <ScrollArea className="max-h-64">
                {comparison.fields.map((f) => (
                  <div key={f.field} className={`grid grid-cols-4 text-sm px-4 py-2.5 border-b border-border last:border-0 ${!f.match ? "bg-destructive/5" : ""}`}>
                    <span className="font-medium text-foreground">{f.field}</span>
                    <span className="text-muted-foreground">{f.compra}</span>
                    <span className="text-muted-foreground">{f.venda}</span>
                    <span>
                      {f.match ? (
                        <CheckCircle className="w-4 h-4 text-success" />
                      ) : (
                        <XCircle className="w-4 h-4 text-destructive" />
                      )}
                    </span>
                  </div>
                ))}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Item Comparison */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="w-4 h-4" />
                Itens ({comparison.itemDiffs.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-[1fr_2fr_80px_80px_80px_80px_100px] text-xs font-medium text-muted-foreground px-4 py-2 border-b border-border bg-muted/30">
                <span>Código</span>
                <span>Produto</span>
                <span className="text-right">Qtd C</span>
                <span className="text-right">Qtd V</span>
                <span className="text-right">Preço C</span>
                <span className="text-right">Preço V</span>
                <span className="text-center">Status</span>
              </div>
              <ScrollArea className="max-h-96">
                {comparison.itemDiffs.map((item) => {
                  const s = statusLabels[item.status];
                  return (
                    <div
                      key={item.cProd}
                      className={`grid grid-cols-[1fr_2fr_80px_80px_80px_80px_100px] text-sm px-4 py-2.5 border-b border-border last:border-0 ${item.status !== "match" ? "bg-destructive/5" : ""}`}
                    >
                      <span className="font-mono text-xs text-muted-foreground">{item.cProd}</span>
                      <span className="text-foreground truncate">{item.xProd}</span>
                      <span className="text-right text-muted-foreground">{item.compraQty ?? "—"}</span>
                      <span className="text-right text-muted-foreground">{item.vendaQty ?? "—"}</span>
                      <span className="text-right text-muted-foreground">{item.compraPrice != null ? item.compraPrice.toFixed(2) : "—"}</span>
                      <span className="text-right text-muted-foreground">{item.vendaPrice != null ? item.vendaPrice.toFixed(2) : "—"}</span>
                      <span className="text-center">
                        <Badge variant={s.variant} className="text-xs">{s.label}</Badge>
                      </span>
                    </div>
                  );
                })}
              </ScrollArea>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}