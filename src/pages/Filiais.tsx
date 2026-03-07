import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Plus, ChevronRight, Pencil, ArrowRightLeft, BarChart3, Shield, RefreshCw, GitBranch, Crown } from "lucide-react";
import { useCnpjLookup } from "@/hooks/useCnpjLookup";
import { motion, AnimatePresence } from "framer-motion";
import StockTransfersSection from "@/components/filiais/StockTransfersSection";
import ConsolidatedSection from "@/components/filiais/ConsolidatedSection";
import PermissionsSection from "@/components/filiais/PermissionsSection";
import { useBranches, useSetParentCompany, useCreateBranch, useDeleteBranch, useUpdateBranch, useSyncProducts } from "@/hooks/useBranches";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import BranchCreateDialog from "@/components/filiais/BranchCreateDialog";
import BranchEditDialog from "@/components/filiais/BranchEditDialog";

const tabs = [
  { key: "hierarquia", label: "Hierarquia", icon: GitBranch },
  { key: "transferencias", label: "Transferências", icon: ArrowRightLeft },
  { key: "consolidado", label: "Consolidado", icon: BarChart3 },
  { key: "permissoes", label: "Permissões", icon: Shield },
] as const;

export default function Filiais() {
  const { data: branches, isLoading } = useBranches();
  const setParent = useSetParentCompany();
  const createBranch = useCreateBranch();
  const deleteBranch = useDeleteBranch();
  const updateBranch = useUpdateBranch();
  const syncProducts = useSyncProducts();
  const { companyId, switchCompany } = useCompany();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<typeof tabs[number]["key"]>("hierarquia");
  const [open, setOpen] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [branchCnpj, setBranchCnpj] = useState("");
  const { lookup: branchCnpjLookup, loading: branchCnpjLoading } = useCnpjLookup();

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState("");
  const [editName, setEditName] = useState("");
  const [editCnpj, setEditCnpj] = useState("");

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Carregando filiais...</p>
        </div>
      </div>
    );
  }

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
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Premium Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/10 p-6">
        <div className="absolute top-0 right-0 w-40 h-40 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Filiais</h1>
              <p className="text-xs text-muted-foreground">Gerencie filiais, transferências e relatórios consolidados</p>
            </div>
          </div>
        </div>
      </div>

      {/* Premium Tab Navigation */}
      <div className="bg-card/50 backdrop-blur-sm border border-border rounded-xl p-1.5 flex gap-1">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-300 ${
                isActive
                  ? "text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="active-tab-filiais"
                  className="absolute inset-0 bg-primary rounded-lg"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Company Switcher */}
      {branches && branches.length > 1 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-card border border-border rounded-xl p-4"
        >
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Empresa Ativa</p>
          <div className="flex flex-wrap gap-2">
            {branches.map(b => (
              <motion.button
                key={b.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={async () => {
                  if (b.id === companyId) return;
                  // Ensure user has company_users record for this branch
                  const { data: access } = await supabase
                    .from("company_users")
                    .select("company_id")
                    .eq("user_id", user!.id)
                    .eq("company_id", b.id)
                    .eq("is_active", true)
                    .maybeSingle();

                  if (!access) {
                    // Auto-link user to child branch they own
                    const { error: linkErr } = await supabase.rpc("link_user_to_company" as any, {
                      p_company_id: b.id,
                      p_user_id: user!.id,
                      p_role: "admin",
                    });
                    if (linkErr) {
                      // Fallback: direct insert
                      await supabase.from("company_users").insert({
                        company_id: b.id,
                        user_id: user!.id,
                        role: "admin",
                        is_active: true,
                      } as any);
                    }
                  }

                  localStorage.setItem("as_selected_company", b.id);
                  switchCompany(b.id);
                  toast.success(`Alternado para: ${b.name}`);
                }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 ${
                  b.id === companyId
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                    : "bg-background border border-border text-foreground hover:border-primary/30 hover:shadow-sm"
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                {b.name}
                {b.is_parent && (
                  <span className="flex items-center gap-0.5 text-[9px] opacity-80">
                    <Crown className="w-2.5 h-2.5" /> Matriz
                  </span>
                )}
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
        >
          {activeTab === "hierarquia" && (
            <HierarchyTab
              parents={parents}
              children={children}
              companyId={companyId}
              open={open}
              setOpen={setOpen}
              branchName={branchName}
              setBranchName={setBranchName}
              branchCnpj={branchCnpj}
              setBranchCnpj={setBranchCnpj}
              branchCnpjLookup={branchCnpjLookup}
              branchCnpjLoading={branchCnpjLoading}
              handleCreateBranch={handleCreateBranch}
              createBranch={createBranch}
              handleEdit={handleEdit}
              editOpen={editOpen}
              setEditOpen={setEditOpen}
              editName={editName}
              setEditName={setEditName}
              editCnpj={editCnpj}
              setEditCnpj={setEditCnpj}
              handleSaveEdit={handleSaveEdit}
              updateBranch={updateBranch}
              setParent={setParent}
              deleteBranch={deleteBranch}
              syncProducts={syncProducts}
            />
          )}
          {activeTab === "transferencias" && <StockTransfersSection />}
          {activeTab === "consolidado" && <ConsolidatedSection />}
          {activeTab === "permissoes" && <PermissionsSection />}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

/* ─── Hierarchy Tab ─── */
function HierarchyTab({
  parents, children: childBranches, companyId, open, setOpen, branchName, setBranchName,
  branchCnpj, setBranchCnpj, branchCnpjLookup, branchCnpjLoading, handleCreateBranch,
  createBranch, handleEdit, editOpen, setEditOpen, editName, setEditName, editCnpj,
  setEditCnpj, handleSaveEdit, updateBranch, setParent, deleteBranch, syncProducts,
}: any) {
  return (
    <div className="space-y-5">
      {/* Header + Nova Filial */}
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-primary" /> Organograma
        </h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-medium shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-shadow"
            >
              <Plus className="w-3.5 h-3.5" /> Nova Filial
            </motion.button>
          </DialogTrigger>
          <BranchCreateDialog
            branchName={branchName}
            setBranchName={setBranchName}
            branchCnpj={branchCnpj}
            setBranchCnpj={setBranchCnpj}
            branchCnpjLookup={branchCnpjLookup}
            branchCnpjLoading={branchCnpjLoading}
            handleCreateBranch={handleCreateBranch}
            isPending={createBranch.isPending}
          />
        </Dialog>
      </div>

      {/* Edit Dialog */}
      <BranchEditDialog
        editOpen={editOpen}
        setEditOpen={setEditOpen}
        editName={editName}
        setEditName={setEditName}
        editCnpj={editCnpj}
        setEditCnpj={setEditCnpj}
        branchCnpjLookup={branchCnpjLookup}
        branchCnpjLoading={branchCnpjLoading}
        handleSaveEdit={handleSaveEdit}
        isPending={updateBranch.isPending}
      />

      {/* Visual Org Chart */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        {/* Matrizes Header */}
        <div className="px-5 py-4 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Crown className="w-4 h-4 text-primary" /> Matrizes
          </h3>
        </div>

        <div className="p-5 space-y-3">
          {parents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma matriz encontrada.</p>
          ) : (
            parents.map((p: any, i: number) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="group flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-primary/5 via-background to-background border border-primary/10 hover:border-primary/30 hover:shadow-md transition-all duration-300"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                  {p.cnpj && <p className="text-[11px] text-muted-foreground font-mono">{p.cnpj}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => handleEdit(p)} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-accent transition-all">
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  {p.id === companyId && (
                    <span className="text-[10px] bg-primary text-primary-foreground px-2.5 py-1 rounded-full font-semibold shadow-sm">Atual</span>
                  )}
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Filiais */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-gradient-to-r from-accent/30 to-transparent flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <ChevronRight className="w-4 h-4 text-primary" /> Filiais
            {childBranches.length > 0 && (
              <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold">
                {childBranches.length}
              </span>
            )}
          </h3>
        </div>

        <div className="p-5">
          {childBranches.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
                <Building2 className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">Nenhuma filial cadastrada ainda.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Clique em "Nova Filial" para começar</p>
            </div>
          ) : (
            <div className="space-y-3">
              {childBranches.map((c: any, i: number) => {
                const parentName = parents.find((p: any) => p.id === c.parent_company_id)?.name || "?";
                return (
                  <motion.div
                    key={c.id}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className="group relative flex items-center gap-3 p-4 rounded-xl bg-background border border-border hover:border-primary/20 hover:shadow-md transition-all duration-300"
                  >
                    {/* Connection line */}
                    <div className="absolute -left-px top-1/2 -translate-y-1/2 w-1 h-8 bg-gradient-to-b from-primary/30 to-primary/5 rounded-full" />
                    
                    <div className="w-9 h-9 rounded-lg bg-accent/50 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Crown className="w-2.5 h-2.5" /> {parentName}
                      </p>
                    </div>
                    <div className="flex gap-1.5 items-center flex-shrink-0">
                      {/* Sync only visible when current company is the matrix (parent) */}
                      {c.parent_company_id === companyId && (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => {
                            syncProducts.mutate({ fromCompanyId: companyId!, toCompanyId: c.id, priceMarginPct: 0 });
                          }}
                          disabled={syncProducts.isPending}
                          className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2.5 py-1.5 bg-primary/10 text-primary rounded-lg text-[10px] font-medium hover:bg-primary/20 transition-all"
                          title="Empurrar catálogo da matriz para esta filial (governança centralizada)"
                        >
                          <RefreshCw className={`w-3 h-3 ${syncProducts.isPending ? "animate-spin" : ""}`} /> Sync
                        </motion.button>
                      )}
                      <button onClick={() => handleEdit(c)} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-accent transition-all" title="Editar">
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button className="opacity-0 group-hover:opacity-100 px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent transition-all">Desvincular</button>
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
                          <button className="opacity-0 group-hover:opacity-100 px-2 py-1 text-[10px] text-destructive hover:bg-destructive/10 rounded-lg transition-all">Excluir</button>
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
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
