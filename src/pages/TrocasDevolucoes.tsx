import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, RotateCcw, ArrowLeftRight, Package, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useReturns, useCreateReturn, useUpdateReturn, type Return } from "@/hooks/useReturns";
import { useSales } from "@/hooks/useSales";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

const statusLabels: Record<string, string> = {
  aberto: "Aberto", em_analise: "Em Análise", aprovado: "Aprovado", recusado: "Recusado", concluido: "Concluído",
};
const statusColors: Record<string, string> = {
  aberto: "bg-amber-500/10 text-amber-600", em_analise: "bg-blue-500/10 text-blue-600",
  aprovado: "bg-primary/10 text-primary", recusado: "bg-destructive/10 text-destructive",
  concluido: "bg-muted text-muted-foreground",
};
const reasonLabels: Record<string, string> = {
  defeito: "Defeito", arrependimento: "Arrependimento", troca_modelo: "Troca de Modelo",
  troca_voltagem: "Voltagem Errada", avaria_transporte: "Avaria no Transporte", outro: "Outro",
};

export default function TrocasDevolucoes() {
  const [tab, setTab] = useState("aberto");
  const { data: returns = [], isLoading } = useReturns(tab === "all" ? undefined : tab);
  const { data: sales = [] } = useSales(200);
  const createReturn = useCreateReturn();
  const updateReturn = useUpdateReturn();
  const [showForm, setShowForm] = useState(false);
  const [detailReturn, setDetailReturn] = useState<Return | null>(null);

  // Form state
  const [saleId, setSaleId] = useState("");
  const [type, setType] = useState<"troca" | "devolucao">("troca");
  const [reasonCategory, setReasonCategory] = useState("defeito");
  const [reason, setReason] = useState("");
  const [clientName, setClientName] = useState("");

  const handleCreate = async () => {
    if (!saleId) { toast.error("Selecione a venda"); return; }
    if (!reason.trim()) { toast.error("Descreva o motivo"); return; }
    // Extract items from sale
    const sale = sales.find(s => s.id === saleId);
    let items: any[] = [];
    if (sale?.items_json) {
      try {
        const raw = sale.items_json;
        if (Array.isArray(raw)) items = raw;
        else if (raw?.items) items = raw.items;
        else if (typeof raw === "string") { const p = JSON.parse(raw); items = Array.isArray(p) ? p : p?.items || []; }
      } catch { /* */ }
    }
    const returnItems = items.map((item: any) => ({
      product_id: item.product_id || null,
      product_name: item.name || item.product_name || "Produto",
      quantity: item.quantity || 1,
      condition: "bom" as const,
    }));

    await createReturn.mutateAsync({
      sale_id: saleId, type, reason_category: reasonCategory, reason,
      client_name: clientName || sale?.customer_name || undefined,
      items: returnItems,
    });
    setShowForm(false);
    setSaleId(""); setReason(""); setClientName("");
  };

  const advanceStatus = (ret: Return) => {
    const flow: Record<string, string> = { aberto: "em_analise", em_analise: "aprovado", aprovado: "concluido" };
    const next = flow[ret.status];
    if (next) {
      updateReturn.mutate({
        id: ret.id,
        status: next as any,
        ...(next === "concluido" ? { resolved_at: new Date().toISOString(), stock_returned: true } : {}),
      });
    }
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Trocas & Devoluções</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Gerencie trocas, devoluções e reembolsos</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2" /> Nova Troca/Devolução
        </Button>
      </motion.div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="aberto">Abertos</TabsTrigger>
          <TabsTrigger value="em_analise">Em Análise</TabsTrigger>
          <TabsTrigger value="aprovado">Aprovados</TabsTrigger>
          <TabsTrigger value="concluido">Concluídos</TabsTrigger>
          <TabsTrigger value="all">Todos</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {isLoading ? (
            [...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl mb-2" />)
          ) : returns.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <RotateCcw className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>Nenhuma troca/devolução {tab !== "all" ? statusLabels[tab]?.toLowerCase() : "encontrada"}.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {returns.map((ret) => (
                <motion.div key={ret.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="bg-card rounded-xl border border-border p-4 hover:shadow-sm transition-shadow cursor-pointer"
                  onClick={() => setDetailReturn(ret)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${ret.type === "troca" ? "bg-blue-500/10" : "bg-amber-500/10"}`}>
                        {ret.type === "troca" ? <ArrowLeftRight className="w-5 h-5 text-blue-600" /> : <RotateCcw className="w-5 h-5 text-amber-600" />}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">
                          {ret.type === "troca" ? "Troca" : "Devolução"} — {ret.client_name || "Cliente"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {reasonLabels[ret.reason_category]} • {format(new Date(ret.created_at), "dd/MM/yyyy", { locale: ptBR })}
                          {ret.items && ` • ${ret.items.length} item(ns)`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className={statusColors[ret.status]}>{statusLabels[ret.status]}</Badge>
                      {ret.status !== "concluido" && ret.status !== "recusado" && (
                        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); advanceStatus(ret); }}>
                          Avançar
                        </Button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Detail Dialog */}
      <Dialog open={!!detailReturn} onOpenChange={v => !v && setDetailReturn(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detailReturn?.type === "troca" ? "Troca" : "Devolução"} — Detalhes</DialogTitle>
          </DialogHeader>
          {detailReturn && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{detailReturn.client_name || "—"}</span></div>
                <div><span className="text-muted-foreground">Status:</span> <Badge className={statusColors[detailReturn.status]}>{statusLabels[detailReturn.status]}</Badge></div>
                <div><span className="text-muted-foreground">Motivo:</span> <span>{reasonLabels[detailReturn.reason_category]}</span></div>
                <div><span className="text-muted-foreground">Data:</span> <span>{format(new Date(detailReturn.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span></div>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg text-sm">
                <p className="text-muted-foreground text-xs mb-1">Descrição</p>
                <p>{detailReturn.reason}</p>
              </div>
              {detailReturn.items && detailReturn.items.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Itens</p>
                  {detailReturn.items.map(item => (
                    <div key={item.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
                      <span>{item.quantity}x {item.product_name}</span>
                      <Badge variant="outline">{item.condition}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Troca / Devolução</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Venda de Origem</Label>
              <Select value={saleId} onValueChange={setSaleId}>
                <SelectTrigger><SelectValue placeholder="Selecione a venda..." /></SelectTrigger>
                <SelectContent>
                  {sales.slice(0, 50).map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      #{s.number || s.id.slice(0, 6)} — {s.customer_name || "Cliente"} — {formatCurrency(s.total_value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={type} onValueChange={(v: any) => setType(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="troca">Troca</SelectItem>
                    <SelectItem value="devolucao">Devolução</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Categoria do Motivo</Label>
                <Select value={reasonCategory} onValueChange={setReasonCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="defeito">Defeito</SelectItem>
                    <SelectItem value="arrependimento">Arrependimento</SelectItem>
                    <SelectItem value="troca_modelo">Troca de Modelo</SelectItem>
                    <SelectItem value="troca_voltagem">Voltagem Errada</SelectItem>
                    <SelectItem value="avaria_transporte">Avaria no Transporte</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Nome do Cliente</Label>
              <Input placeholder="Nome do cliente" value={clientName} onChange={e => setClientName(e.target.value)} />
            </div>
            <div>
              <Label>Descrição do Motivo</Label>
              <Textarea placeholder="Descreva o problema em detalhes..." value={reason} onChange={e => setReason(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={createReturn.isPending}>Registrar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
