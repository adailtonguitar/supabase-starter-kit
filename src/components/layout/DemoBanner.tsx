import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, Trash2, Loader2, Clock, RotateCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { useAdminRole } from "@/hooks/useAdminRole";
import { supabase } from "@/integrations/supabase/client";
import { DemoDataService } from "@/services/DemoDataService";
import { toast } from "sonner";

export function DemoBanner() {
  const { companyId } = useCompany();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isDemo, setIsDemo] = useState(false);
  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    if (!companyId) { setIsDemo(false); return; }
    
    const check = async () => {
      const demo = await DemoDataService.isDemoCompany(companyId);
      setIsDemo(demo);
      
      if (demo) {
        // Check plan expiration
        const { data } = await supabase
          .from("company_plans")
          .select("expires_at")
          .eq("company_id", companyId)
          .eq("status", "active")
          .maybeSingle();
        
        if (data?.expires_at) {
          const diff = new Date(data.expires_at).getTime() - Date.now();
          const days = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
          setDaysLeft(days);
        }
      }
    };
    check();
  }, [companyId]);

  // Auto-seed on first load
  useEffect(() => {
    if (!isDemo || !companyId || !user) return;
    if (DemoDataService.isSeeded(companyId)) return;

    setSeeding(true);
    DemoDataService.seedDemoData(companyId, user.id)
      .then((r) => {
        if (r.products > 0) {
          toast.success("Dados demo prontos! 🎉", {
            description: `${r.products} produtos, ${r.clients} clientes, ${r.sales} vendas criados.`,
          });
        }
        // If -1 (already seeded) or 0 (failed), don't show toast — Auth.tsx already handled it
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

  const handleResetAll = useCallback(async () => {
    if (!companyId) return;
    if (!confirm("⚠️ ATENÇÃO: Isso vai apagar TODOS os dados desta empresa demo (produtos, clientes, vendas, financeiro). Deseja continuar?")) return;
    setResetting(true);
    try {
      await DemoDataService.resetAllData(companyId);
      toast.success("Todos os dados foram removidos! Os dados demo serão recriados ao recarregar.");
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      toast.error(`Erro ao resetar: ${err.message}`);
    }
    setResetting(false);
  }, [companyId]);

  if (!isDemo) return null;

  const expired = daysLeft !== null && daysLeft <= 0;

  if (expired) {
    return (
      <div className="w-full bg-destructive/90 text-destructive-foreground px-4 py-3 flex items-center justify-between gap-3 text-sm font-medium">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 shrink-0" />
          <span>Seu período de teste expirou. Assine um plano para continuar usando o sistema.</span>
        </div>
        <button
          onClick={() => navigate("/renovar")}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-background text-foreground text-xs font-bold whitespace-nowrap hover:opacity-90 transition-colors"
        >
          Assinar agora
        </button>
      </div>
    );
  }

  return (
    <div className="w-full bg-amber-500/90 text-amber-950 px-4 py-2 flex items-center justify-between gap-3 text-sm font-medium">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span>
          {seeding
            ? "Gerando dados de demonstração..."
            : `Versão de demonstração${daysLeft !== null ? ` — ${daysLeft} dia${daysLeft !== 1 ? "s" : ""} restante${daysLeft !== 1 ? "s" : ""}` : ""}`}
        </span>
        {seeding && <Loader2 className="w-4 h-4 animate-spin" />}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleClear}
          disabled={clearing || seeding || resetting}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-950/20 hover:bg-amber-950/30 transition-colors text-xs font-bold disabled:opacity-50 whitespace-nowrap"
        >
          {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          Limpar demo
        </button>
        <button
          onClick={handleResetAll}
          disabled={resetting || seeding || clearing}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-950/30 hover:bg-amber-950/40 transition-colors text-xs font-bold disabled:opacity-50 whitespace-nowrap"
        >
          {resetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
          Resetar tudo
        </button>
      </div>
    </div>
  );
}
