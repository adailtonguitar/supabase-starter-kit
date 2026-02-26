import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, UserPlus } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type CompanyRole = "admin" | "gerente" | "supervisor" | "caixa";
const roleLabels: Record<CompanyRole, string> = {
  admin: "Administrador",
  gerente: "Gerente",
  supervisor: "Supervisor",
  caixa: "Caixa",
};

export function InviteUserDialog({ open, onOpenChange }: Props) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CompanyRole>("caixa");
  const [loading, setLoading] = useState(false);
  const plan = usePlanFeatures();
  const { isSuperAdmin } = useAdminRole();
  const { companyId } = useCompany();

  const handleInvite = async () => {
    if (!email.trim()) { toast.warning("Informe o email"); return; }
    if (!companyId) { toast.error("Empresa não identificada"); return; }

    // Super admin bypasses plan limits
    if (!isSuperAdmin) {
      try {
        const result = await plan.checkServerLimit("add_user");
        if (!result.allowed) {
          toast.error(result.reason || "Limite de usuários atingido no seu plano.");
          return;
        }
      } catch { /* Fail open */ }
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada");

      const res = await supabase.functions.invoke("invite-user", {
        body: { email: email.trim(), role, company_id: companyId },
      });

      if (res.error) throw new Error(res.error.message);
      const result = res.data;

      if (result.error) {
        toast.error(result.error);
      } else if (result.isNew) {
        toast.success(`Convite enviado para ${email}! O usuário receberá um email para criar a senha.`);
        onOpenChange(false);
        setEmail("");
        setRole("caixa");
      } else {
        toast.success(`Usuário ${email} adicionado à empresa com sucesso!`);
        onOpenChange(false);
        setEmail("");
        setRole("caixa");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao convidar usuário");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Convidar Usuário
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Email</Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@email.com"
              type="email"
              onKeyDown={(e) => e.key === "Enter" && handleInvite()}
            />
          </div>
          <div>
            <Label>Perfil de Acesso</Label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as CompanyRole)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm mt-1"
            >
              {Object.entries(roleLabels).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            {isSuperAdmin
              ? "Super admin: sem limite de usuários."
              : `Seu plano permite até ${plan.maxUsers <= 0 ? "ilimitados" : plan.maxUsers} usuário(s).`}
          </p>
          <Button onClick={handleInvite} className="w-full" disabled={loading}>
            {loading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Enviando convite...</> : "Enviar Convite"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
