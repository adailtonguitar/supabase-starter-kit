import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, Trash2, Loader2 } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { DemoDataService } from "@/services/DemoDataService";
import { toast } from "sonner";

export function DemoBanner() {
  const { companyId } = useCompany();
  const { user } = useAuth();
  const [isDemo, setIsDemo] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    if (!companyId) { setIsDemo(false); return; }
    DemoDataService.isDemoCompany(companyId).then(setIsDemo);
  }, [companyId]);

  // Auto-seed on first load
  useEffect(() => {
    if (!isDemo || !companyId || !user) return;
    if (DemoDataService.isSeeded(companyId)) return;

    setSeeding(true);
    DemoDataService.seedDemoData(companyId, user.id)
      .then((r) => {
        toast.success(`Dados demo criados: ${r.products} produtos, ${r.clients} clientes, ${r.sales} vendas`);
      })
      .catch((err) => {
        toast.error(`Erro ao gerar dados demo: ${err.message}`);
      })
      .finally(() => setSeeding(false));
  }, [isDemo, companyId, user]);

  const handleClear = useCallback(async () => {
    if (!companyId) return;
    if (!confirm("Tem certeza que deseja limpar todos os dados de demonstração?")) return;
    setClearing(true);
    try {
      await DemoDataService.clearDemoData(companyId);
      toast.success("Dados de demonstração removidos com sucesso!");
    } catch (err: any) {
      toast.error(`Erro ao limpar dados demo: ${err.message}`);
    }
    setClearing(false);
  }, [companyId]);

  if (!isDemo) return null;

  return (
    <div className="w-full bg-amber-500/90 text-amber-950 px-4 py-2 flex items-center justify-between gap-3 text-sm font-medium">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span>
          {seeding
            ? "Gerando dados de demonstração..."
            : "Você está usando a versão de demonstração do sistema."}
        </span>
        {seeding && <Loader2 className="w-4 h-4 animate-spin" />}
      </div>
      <button
        onClick={handleClear}
        disabled={clearing || seeding}
        className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-950/20 hover:bg-amber-950/30 transition-colors text-xs font-bold disabled:opacity-50 whitespace-nowrap"
      >
        {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        Limpar dados de demonstração
      </button>
    </div>
  );
}
