import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pencil } from "lucide-react";

interface Props {
  editOpen: boolean;
  setEditOpen: (v: boolean) => void;
  editName: string;
  setEditName: (v: string) => void;
  editCnpj: string;
  setEditCnpj: (v: string) => void;
  branchCnpjLookup: (cnpj: string) => Promise<any>;
  branchCnpjLoading: boolean;
  handleSaveEdit: () => void;
  isPending: boolean;
}

export default function BranchEditDialog({
  editOpen, setEditOpen, editName, setEditName, editCnpj, setEditCnpj,
  branchCnpjLookup, branchCnpjLoading, handleSaveEdit, isPending,
}: Props) {
  return (
    <Dialog open={editOpen} onOpenChange={setEditOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
              <Pencil className="w-5 h-5 text-foreground" />
            </div>
            <DialogTitle>Editar Filial</DialogTitle>
          </div>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wider">Nome *</label>
            <input
              value={editName}
              onChange={e => setEditName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wider">CNPJ</label>
            <div className="flex gap-2">
              <input
                value={editCnpj}
                onChange={e => setEditCnpj(e.target.value)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all outline-none font-mono"
              />
              <button
                type="button"
                disabled={branchCnpjLoading || (editCnpj || "").replace(/\D/g, "").length < 14}
                onClick={async () => {
                  const result = await branchCnpjLookup(editCnpj);
                  if (result) setEditName(result.name || editName);
                }}
                className="px-4 py-2.5 rounded-xl bg-accent text-accent-foreground text-xs font-semibold hover:bg-accent/80 disabled:opacity-50 transition-all"
              >
                {branchCnpjLoading ? "..." : "Consultar"}
              </button>
            </div>
          </div>
          <button
            onClick={handleSaveEdit}
            disabled={isPending}
            className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50 shadow-lg shadow-primary/20 transition-all"
          >
            {isPending ? "Salvando..." : "Salvar Alterações"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
