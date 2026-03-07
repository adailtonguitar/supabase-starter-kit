import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Building2 } from "lucide-react";

interface Props {
  branchName: string;
  setBranchName: (v: string) => void;
  branchCnpj: string;
  setBranchCnpj: (v: string) => void;
  branchCnpjLookup: (cnpj: string) => Promise<any>;
  branchCnpjLoading: boolean;
  handleCreateBranch: () => void;
  isPending: boolean;
}

export default function BranchCreateDialog({
  branchName, setBranchName, branchCnpj, setBranchCnpj,
  branchCnpjLookup, branchCnpjLoading, handleCreateBranch, isPending,
}: Props) {
  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <DialogTitle>Nova Filial</DialogTitle>
        </div>
      </DialogHeader>
      <div className="space-y-4 pt-2">
        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wider">Nome da Filial *</label>
          <input
            value={branchName}
            onChange={e => setBranchName(e.target.value)}
            placeholder="Ex: Loja Centro"
            className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all outline-none"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wider">CNPJ (opcional)</label>
          <div className="flex gap-2">
            <input
              value={branchCnpj}
              onChange={e => setBranchCnpj(e.target.value)}
              placeholder="00.000.000/0000-00"
              className="flex-1 px-4 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all outline-none font-mono"
            />
            <button
              type="button"
              disabled={branchCnpjLoading || branchCnpj.replace(/\D/g, "").length < 14}
              onClick={async () => {
                const result = await branchCnpjLookup(branchCnpj);
                if (result) setBranchName(result.name || branchName);
              }}
              className="px-4 py-2.5 rounded-xl bg-accent text-accent-foreground text-xs font-semibold hover:bg-accent/80 disabled:opacity-50 transition-all"
            >
              {branchCnpjLoading ? "..." : "Consultar"}
            </button>
          </div>
        </div>
        <button
          onClick={handleCreateBranch}
          disabled={isPending}
          className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50 shadow-lg shadow-primary/20 transition-all"
        >
          {isPending ? "Criando..." : "Criar Filial"}
        </button>
      </div>
    </DialogContent>
  );
}
