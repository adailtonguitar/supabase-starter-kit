import { useState } from "react";
import { Building2, ArrowRightLeft, BarChart3, Plus, Package, Check, X, Truck, ChevronRight, Pencil, RefreshCw, Calendar, Filter, ArrowDownUp } from "lucide-react";
import { motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBranches, useSetParentCompany, useCreateBranch, useDeleteBranch, useUpdateBranch, useSyncProducts } from "@/hooks/useBranches";
import { useStockTransfers, useCreateStockTransfer, useReceiveStockTransfer } from "@/hooks/useStockTransfers";
import { useConsolidatedReport } from "@/hooks/useConsolidatedReport";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { useProducts } from "@/hooks/useProducts";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

// ──── Company Switcher ────
function CompanySwitcher() {
  const { data: branches } = useBranches();
  const { companyId, companyName, switchCompany } = useCompany();

  if (!branches || branches.length <= 1) {
    console.log("[CompanySwitcher] branches:", branches?.length, branches);
    return null;
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 mb-4">
      <p className="text-xs font-medium text-muted-foreground mb-2">Empresa Ativa</p>
      <div className="flex flex-wrap gap-2">
        {branches.map(b => (
          <button
            key={b.id}
            onClick={() => {
              switchCompany(b.id);
              toast.success(`Alternado para: ${b.name}`);
              // Reload page to refresh all data
              setTimeout(() => window.location.reload(), 500);
            }}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              b.id === companyId
                ? "bg-primary text-primary-foreground"
                : "bg-background border border-border text-foreground hover:bg-accent"
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            {b.name}
            {b.is_parent && <span className="text-[9px] opacity-70">(Matriz)</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ──── Hierarquia Tab ────
function HierarchyTab() {
  const { data: branches, isLoading } = useBranches();
  const setParent = useSetParentCompany();
  const createBranch = useCreateBranch();
  const deleteBranch = useDeleteBranch();
  const updateBranch = useUpdateBranch();
  const syncProducts = useSyncProducts();
  const { companyId } = useCompany();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [branchCnpj, setBranchCnpj] = useState("");

  // Edit state
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState("");
  const [editName, setEditName] = useState("");
  const [editCnpj, setEditCnpj] = useState("");

  // Sync state
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncTargetId, setSyncTargetId] = useState("");

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">Carregando...</div>;

  const parents = (branches || []).filter(b => b.is_parent);
  const children = (branches || []).filter(b => !b.is_parent);

  const handleCreateBranch = () => {
    if (createBranch.isPending) return;
    if (!branchName.trim() || !companyId || !user) {
      toast.warning("Preencha o nome da filial");
      return;
    }
    createBranch.mutate({
      name: branchName.trim(),
      cnpj: branchCnpj.trim() || undefined,
      parentId: companyId,
      userId: user.id,
    }, {
      onSuccess: () => {
        setOpen(false);
        setBranchName("");
        setBranchCnpj("");
      },
    });
  };

  const handleEdit = (branch: any) => {
    setEditId(branch.id);
    setEditName(branch.name);
    setEditCnpj(branch.cnpj || "");
    setEditOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editName.trim()) return;
    updateBranch.mutate({ companyId: editId, name: editName.trim(), cnpj: editCnpj.trim() || undefined }, {
      onSuccess: () => setEditOpen(false),
    });
  };

  const handleSync = () => {
    if (!companyId || !syncTargetId) return;
    syncProducts.mutate({ fromCompanyId: companyId, toCompanyId: syncTargetId }, {
      onSuccess: () => setSyncOpen(false),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" /> Hierarquia
        </h3>
        <div className="flex gap-2">
          {/* Sync Products Button */}
          {children.length > 0 && (
            <Dialog open={syncOpen} onOpenChange={setSyncOpen}>
              <DialogTrigger asChild>
                <button className="flex items-center gap-1.5 px-3 py-2 bg-accent text-accent-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-all">
                  <RefreshCw className="w-3.5 h-3.5" /> Sincronizar Produtos
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Sincronizar Produtos</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <p className="text-sm text-muted-foreground">Copiar catálogo de produtos da matriz para uma filial. Produtos já existentes serão ignorados.</p>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Filial Destino</label>
                    <select value={syncTargetId} onChange={e => setSyncTargetId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm">
                      <option value="">Selecione...</option>
                      {children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <button onClick={handleSync} disabled={syncProducts.isPending || !syncTargetId}
                    className="w-full py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50">
                    {syncProducts.isPending ? "Sincronizando..." : "Sincronizar"}
                  </button>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {/* New Branch Button */}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <button className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-all">
                <Plus className="w-3.5 h-3.5" /> Nova Filial
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cadastrar Nova Filial</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome da Filial *</label>
                  <input value={branchName} onChange={e => setBranchName(e.target.value)} placeholder="Ex: Loja Centro"
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">CNPJ (opcional)</label>
                  <input value={branchCnpj} onChange={e => setBranchCnpj(e.target.value)} placeholder="00.000.000/0000-00"
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm" />
                </div>
                <p className="text-xs text-muted-foreground">A filial será vinculada automaticamente à sua empresa atual como matriz.</p>
                <button onClick={handleCreateBranch} disabled={createBranch.isPending}
                  className="w-full py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50">
                  {createBranch.isPending ? "Criando..." : "Criar Filial"}
                </button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Filial</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome *</label>
              <input value={editName} onChange={e => setEditName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">CNPJ</label>
              <input value={editCnpj} onChange={e => setEditCnpj(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm" />
            </div>
            <button onClick={handleSaveEdit} disabled={updateBranch.isPending}
              className="w-full py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50">
              {updateBranch.isPending ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Matrizes */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" /> Matrizes
        </h3>
        {parents.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma matriz encontrada.</p>
        ) : (
          <div className="space-y-3">
            {parents.map(p => (
              <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg bg-background border border-border">
                <Building2 className="w-5 h-5 text-primary" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{p.name}</p>
                  {p.cnpj && <p className="text-xs text-muted-foreground">{p.cnpj}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleEdit(p)} className="text-xs text-muted-foreground hover:text-foreground">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {p.id === companyId && (
                    <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">Atual</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filiais */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <ChevronRight className="w-4 h-4 text-primary" /> Filiais
        </h3>
        {children.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma filial cadastrada ainda. Clique em <strong>"Nova Filial"</strong> acima para adicionar sua primeira unidade.</p>
        ) : (
          <div className="space-y-3">
            {children.map(c => {
              const parentName = parents.find(p => p.id === c.parent_company_id)?.name || "?";
              return (
                <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg bg-background border border-border">
                  <Building2 className="w-5 h-5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">Matriz: {parentName}</p>
                  </div>
                  <div className="flex gap-2 items-center">
                    <button onClick={() => handleEdit(c)} className="text-xs text-muted-foreground hover:text-foreground" title="Editar">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button className="text-xs text-muted-foreground hover:underline">Desvincular</button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Desvincular filial</AlertDialogTitle>
                          <AlertDialogDescription>A filial "{c.name}" será desvinculada da matriz, mas continuará existindo como empresa independente.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => setParent.mutate({ companyId: c.id, parentId: null })}>Desvincular</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button className="text-xs text-destructive hover:underline">Excluir</button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir filial permanentemente</AlertDialogTitle>
                          <AlertDialogDescription>A filial "{c.name}" e todos os dados associados serão excluídos permanentemente. Esta ação não pode ser desfeita.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteBranch.mutate(c.id)}>Excluir</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ──── Transferências Tab (com filtros) ────
function TransfersTab() {
  const { data: transfers, isLoading } = useStockTransfers();
  const { data: branches } = useBranches();
  const { data: products } = useProducts();
  const { companyId } = useCompany();
  const createTransfer = useCreateStockTransfer();
  const receiveTransfer = useReceiveStockTransfer();

  const [showForm, setShowForm] = useState(false);
  const [toCompanyId, setToCompanyId] = useState("");
  const [selectedItems, setSelectedItems] = useState<{ product_id: string; product_name: string; product_sku: string; quantity: number; unit_cost: number }[]>([]);
  const [notes, setNotes] = useState("");
  const [searchProduct, setSearchProduct] = useState("");

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState(format(subMonths(new Date(), 1), "yyyy-MM-dd"));
  const [filterDateTo, setFilterDateTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const otherBranches = (branches || []).filter(b => b.id !== companyId);

  const filteredProducts = (products || []).filter((p: any) =>
    p.name?.toLowerCase().includes(searchProduct.toLowerCase()) ||
    p.sku?.toLowerCase().includes(searchProduct.toLowerCase())
  ).slice(0, 10);

  const filteredTransfers = (transfers || []).filter(t => {
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    const tDate = new Date(t.created_at);
    if (filterDateFrom && tDate < new Date(filterDateFrom)) return false;
    if (filterDateTo && tDate > new Date(filterDateTo + "T23:59:59")) return false;
    return true;
  });

  const addItem = (product: any) => {
    if (selectedItems.find(i => i.product_id === product.id)) return;
    setSelectedItems(prev => [...prev, {
      product_id: product.id,
      product_name: product.name,
      product_sku: product.sku || "",
      quantity: 1,
      unit_cost: product.cost_price || 0,
    }]);
    setSearchProduct("");
  };

  const handleCreate = () => {
    if (!companyId || !toCompanyId || selectedItems.length === 0) {
      toast.warning("Preencha todos os campos");
      return;
    }
    createTransfer.mutate({
      from_company_id: companyId,
      to_company_id: toCompanyId,
      notes,
      items: selectedItems,
    }, {
      onSuccess: () => {
        setShowForm(false);
        setSelectedItems([]);
        setToCompanyId("");
        setNotes("");
      },
    });
  };

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-500/10 text-yellow-600",
    in_transit: "bg-blue-500/10 text-blue-600",
    received: "bg-green-500/10 text-green-600",
    cancelled: "bg-red-500/10 text-red-600",
  };
  const statusLabels: Record<string, string> = {
    pending: "Pendente",
    in_transit: "Em Trânsito",
    received: "Recebida",
    cancelled: "Cancelada",
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-foreground">Transferências de Estoque</h3>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-all">
          <Plus className="w-3.5 h-3.5" /> Nova Transferência
        </button>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground block mb-1">Status</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-2 py-1.5 rounded-lg bg-background border border-border text-foreground text-xs">
            <option value="all">Todos</option>
            <option value="pending">Pendente</option>
            <option value="in_transit">Em Trânsito</option>
            <option value="received">Recebida</option>
            <option value="cancelled">Cancelada</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground block mb-1">De</label>
          <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
            className="px-2 py-1.5 rounded-lg bg-background border border-border text-foreground text-xs" />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground block mb-1">Até</label>
          <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
            className="px-2 py-1.5 rounded-lg bg-background border border-border text-foreground text-xs" />
        </div>
        <span className="text-[10px] text-muted-foreground">{filteredTransfers.length} resultado(s)</span>
      </div>

      {showForm && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Filial Destino</label>
            <select value={toCompanyId} onChange={e => setToCompanyId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm">
              <option value="">Selecione...</option>
              {otherBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Produtos</label>
            <input value={searchProduct} onChange={e => setSearchProduct(e.target.value)} placeholder="Buscar produto..."
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm" />
            {searchProduct && (
              <div className="mt-1 bg-background border border-border rounded-lg max-h-40 overflow-y-auto">
                {filteredProducts.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-muted-foreground">Nenhum produto encontrado</p>
                ) : (
                  filteredProducts.map((p: any) => (
                    <button key={p.id} onClick={() => addItem(p)} className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors">
                      {p.name} <span className="text-muted-foreground">({p.sku})</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {selectedItems.length > 0 && (
            <div className="space-y-2">
              {selectedItems.map((item, idx) => (
                <div key={item.product_id} className="flex items-center gap-2 bg-background p-2 rounded-lg border border-border">
                  <Package className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm flex-1 truncate">{item.product_name}</span>
                  <input type="number" min={1} value={item.quantity} onChange={e => {
                    const val = Number(e.target.value);
                    setSelectedItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: val } : it));
                  }} className="w-16 px-2 py-1 rounded bg-background border border-border text-sm text-center" />
                  <button onClick={() => setSelectedItems(prev => prev.filter((_, i) => i !== idx))} className="text-destructive">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observações (opcional)"
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm" rows={2} />

          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={createTransfer.isPending}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50">
              <Truck className="w-3.5 h-3.5" /> {createTransfer.isPending ? "Enviando..." : "Criar Transferência"}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-xs">Cancelar</button>
          </div>
        </motion.div>
      )}

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : filteredTransfers.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ArrowRightLeft className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Nenhuma transferência encontrada</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTransfers.map(t => (
            <div key={t.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColors[t.status]}`}>
                    {statusLabels[t.status]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(t.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </span>
                </div>
                {t.status === "pending" && t.to_company_id === companyId && (
                  <button onClick={() => receiveTransfer.mutate(t.id)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:opacity-90">
                    <Check className="w-3.5 h-3.5" /> Receber
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-foreground">{t.from_company?.name}</span>
                <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium text-foreground">{t.to_company?.name}</span>
              </div>
              {t.items && t.items.length > 0 && (
                <div className="mt-2 space-y-1">
                  {t.items.map((item: any) => (
                    <div key={item.id} className="text-xs text-muted-foreground flex gap-2">
                      <Package className="w-3 h-3 mt-0.5" />
                      <span>{item.product_name} — {item.quantity} un</span>
                    </div>
                  ))}
                </div>
              )}
              {t.notes && <p className="text-xs text-muted-foreground mt-2 italic">{t.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ──── Relatório Consolidado Tab (com gráficos) ────
function ConsolidatedTab() {
  const [dateFrom, setDateFrom] = useState(startOfMonth(new Date()));
  const [dateTo, setDateTo] = useState(endOfMonth(new Date()));
  const { data, isLoading } = useConsolidatedReport(dateFrom, dateTo);

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">Carregando...</div>;
  if (!data || data.branches.length === 0) return <p className="text-sm text-muted-foreground text-center py-8">Nenhuma filial encontrada.</p>;

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const chartData = data.branches.map(b => ({
    name: b.companyName.length > 15 ? b.companyName.substring(0, 15) + "..." : b.companyName,
    faturamento: b.totalSales,
    vendas: b.salesCount,
    produtos: b.totalProducts,
    clientes: b.totalClients,
  }));

  return (
    <div className="space-y-6">
      {/* Date filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground block mb-1">De</label>
          <input type="date" value={format(dateFrom, "yyyy-MM-dd")} onChange={e => setDateFrom(new Date(e.target.value))}
            className="px-2 py-1.5 rounded-lg bg-background border border-border text-foreground text-xs" />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground block mb-1">Até</label>
          <input type="date" value={format(dateTo, "yyyy-MM-dd")} onChange={e => setDateTo(new Date(e.target.value))}
            className="px-2 py-1.5 rounded-lg bg-background border border-border text-foreground text-xs" />
        </div>
      </div>

      {/* Totais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Faturamento Total", value: fmt(data.totalSales) },
          { label: "Vendas", value: data.totalSalesCount.toString() },
          { label: "Produtos Ativos", value: data.totalProducts.toString() },
          { label: "Clientes", value: data.totalClients.toString() },
        ].map(card => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className="text-lg font-bold text-foreground mt-1">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Chart - Faturamento por Filial */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Faturamento por Filial</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: number) => fmt(v)} />
            <Bar dataKey="faturamento" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Chart - Vendas vs Clientes */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Vendas e Clientes por Filial</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="vendas" name="Vendas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            <Bar dataKey="clientes" name="Clientes" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Detalhamento por Filial</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left px-4 py-2 font-medium">Filial</th>
                <th className="text-right px-4 py-2 font-medium">Faturamento</th>
                <th className="text-right px-4 py-2 font-medium">Vendas</th>
                <th className="text-right px-4 py-2 font-medium">Produtos</th>
                <th className="text-right px-4 py-2 font-medium">Clientes</th>
              </tr>
            </thead>
            <tbody>
              {data.branches.map(b => (
                <tr key={b.companyId} className="border-b border-border last:border-0 hover:bg-accent/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{b.companyName}</td>
                  <td className="px-4 py-3 text-right">{fmt(b.totalSales)}</td>
                  <td className="px-4 py-3 text-right">{b.salesCount}</td>
                  <td className="px-4 py-3 text-right">{b.totalProducts}</td>
                  <td className="px-4 py-3 text-right">{b.totalClients}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ──── Permissões Tab ────
function PermissionsTab() {
  const { data: branches } = useBranches();
  const { companyId } = useCompany();
  const { user } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUsers = async () => {
    if (!companyId) return;
    setLoading(true);
    const { data: cuData } = await (await import("@/integrations/supabase/client")).supabase
      .from("company_users")
      .select("id, user_id, company_id, role, is_active")
      .in("company_id", (branches || []).map(b => b.id));

    if (cuData) {
      const userIds = [...new Set(cuData.map((u: any) => u.user_id))];
      const { data: profiles } = await (await import("@/integrations/supabase/client")).supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

      // Group by user
      const userMap = new Map<string, any>();
      for (const cu of cuData) {
        if (!userMap.has(cu.user_id)) {
          const profile = profileMap.get(cu.user_id);
          userMap.set(cu.user_id, {
            userId: cu.user_id,
            name: profile?.full_name || profile?.email || "Sem nome",
            email: profile?.email || "",
            branches: [],
          });
        }
        userMap.get(cu.user_id).branches.push({
          companyId: cu.company_id,
          role: cu.role,
          isActive: cu.is_active,
          cuId: cu.id,
        });
      }
      setUsers(Array.from(userMap.values()));
    }
    setLoading(false);
  };

  useState(() => { loadUsers(); });

  if (loading) return <div className="text-center py-8 text-muted-foreground">Carregando...</div>;

  const branchNames = new Map((branches || []).map(b => [b.id, b.name]));

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground">Permissões por Filial</h3>
      <p className="text-xs text-muted-foreground">Veja quais filiais cada usuário tem acesso. Para adicionar/remover acesso, use a gestão de usuários em cada filial.</p>

      {users.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhum usuário encontrado.</p>
      ) : (
        <div className="space-y-3">
          {users.map((u: any) => (
            <div key={u.userId} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-xs font-bold text-primary">{(u.name || "?")[0].toUpperCase()}</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{u.name}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {u.branches.map((b: any) => (
                  <span key={b.companyId} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    b.isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground line-through"
                  }`}>
                    {branchNames.get(b.companyId) || "?"} ({b.role})
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ──── Main Page ────
export default function Filiais() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" /> Filiais
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Gerencie filiais, transferências e relatórios consolidados</p>
      </div>

      {/* Company Switcher */}
      <CompanySwitcher />

      <Tabs defaultValue="hierarchy" className="w-full">
        <TabsList className="w-full grid grid-cols-4 h-auto mb-4">
          <TabsTrigger value="hierarchy" className="text-[11px] py-2">
            <Building2 className="w-3.5 h-3.5 mr-1" /> Hierarquia
          </TabsTrigger>
          <TabsTrigger value="transfers" className="text-[11px] py-2">
            <ArrowRightLeft className="w-3.5 h-3.5 mr-1" /> Transf.
          </TabsTrigger>
          <TabsTrigger value="consolidated" className="text-[11px] py-2">
            <BarChart3 className="w-3.5 h-3.5 mr-1" /> Consolid.
          </TabsTrigger>
          <TabsTrigger value="permissions" className="text-[11px] py-2">
            <Filter className="w-3.5 h-3.5 mr-1" /> Permissões
          </TabsTrigger>
        </TabsList>

        <TabsContent value="hierarchy"><HierarchyTab /></TabsContent>
        <TabsContent value="transfers"><TransfersTab /></TabsContent>
        <TabsContent value="consolidated"><ConsolidatedTab /></TabsContent>
        <TabsContent value="permissions"><PermissionsTab /></TabsContent>
      </Tabs>
    </motion.div>
  );
}
