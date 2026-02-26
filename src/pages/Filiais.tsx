import { useState } from "react";
import { Building2, Plus, ChevronRight, Pencil, ArrowRightLeft, BarChart3 } from "lucide-react";
import { motion } from "framer-motion";
import StockTransfersSection from "@/components/filiais/StockTransfersSection";
import ConsolidatedSection from "@/components/filiais/ConsolidatedSection";
import { useBranches, useSetParentCompany, useCreateBranch, useDeleteBranch, useUpdateBranch } from "@/hooks/useBranches";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export default function Filiais() {
  const { data: branches, isLoading } = useBranches();
  const setParent = useSetParentCompany();
  const createBranch = useCreateBranch();
  const deleteBranch = useDeleteBranch();
  const updateBranch = useUpdateBranch();
  const { companyId, switchCompany } = useCompany();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<"hierarquia" | "transferencias" | "consolidado">("hierarquia");
  const [open, setOpen] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [branchCnpj, setBranchCnpj] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState("");
  const [editName, setEditName] = useState("");
  const [editCnpj, setEditCnpj] = useState("");

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Carregando...</div>;

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

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" /> Filiais
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Gerencie filiais, transferências e relatórios consolidados</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab("hierarquia")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
            activeTab === "hierarquia"
              ? "bg-primary text-primary-foreground"
              : "bg-card border border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          <Building2 className="w-3.5 h-3.5" /> Hierarquia
        </button>
        <button
          onClick={() => setActiveTab("transferencias")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
            activeTab === "transferencias"
              ? "bg-primary text-primary-foreground"
              : "bg-card border border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          <ArrowRightLeft className="w-3.5 h-3.5" /> Transferências
        </button>
        <button
          onClick={() => setActiveTab("consolidado")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
            activeTab === "consolidado"
              ? "bg-primary text-primary-foreground"
              : "bg-card border border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" /> Consolidado
        </button>
      </div>

      {/* Company Switcher */}
      {branches && branches.length > 1 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">Empresa Ativa</p>
          <div className="flex flex-wrap gap-2">
            {branches.map(b => (
              <button
                key={b.id}
                onClick={() => {
                  switchCompany(b.id);
                  toast.success(`Alternado para: ${b.name}`);
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
      )}

      {/* Tab Content */}
      {activeTab === "hierarquia" && (
        <>
          {/* Header + Nova Filial */}
          <div className="flex flex-wrap justify-between items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" /> Hierarquia
            </h3>
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
                  <button onClick={handleCreateBranch} disabled={createBranch.isPending}
                    className="w-full py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50">
                    {createBranch.isPending ? "Criando..." : "Criar Filial"}
                  </button>
                </div>
              </DialogContent>
            </Dialog>
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
              <p className="text-sm text-muted-foreground">Nenhuma filial cadastrada ainda.</p>
            ) : (
              <div className="space-y-3">
                {children.map(c => {
                  const parentName = parents.find(p => p.id === c.parent_company_id)?.name || "?";
                  return (
                    <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg bg-background border border-border">
                      <Building2 className="w-5 h-5 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{c.name}</p>
                        <p className="text-xs text-muted-foreground">Matriz: {parentName}</p>
                      </div>
                      <div className="flex gap-2 items-center flex-shrink-0">
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
                              <AlertDialogDescription>A filial "{c.name}" será desvinculada da matriz.</AlertDialogDescription>
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
                              <AlertDialogDescription>A filial "{c.name}" e todos os dados serão excluídos permanentemente.</AlertDialogDescription>
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
        </>
      )}

      {activeTab === "transferencias" && <StockTransfersSection />}
      {activeTab === "consolidado" && <ConsolidatedSection />}
    </motion.div>
  );
}
