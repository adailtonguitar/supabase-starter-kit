import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import { useAdminRole } from "@/hooks/useAdminRole";
import { Lock, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function InviteUserDialog({ open, onOpenChange }: Props) {
  const [email, setEmail] = useState("");
  const [checking, setChecking] = useState(false);
  const plan = usePlanFeatures();
  const { isSuperAdmin } = useAdminRole();

  const handleInvite = async () => {
    if (!email.trim()) { toast.warning("Informe o email"); return; }

    // Super admin bypasses plan limits
    if (!isSuperAdmin) {
      setChecking(true);
      try {
        const result = await plan.checkServerLimit("add_user");
        if (!result.allowed) {
          toast.error(result.reason || "Limite de usuários atingido no seu plano.");
          setChecking(false);
          return;
        }
      } catch {
        // Fail open
      }
      setChecking(false);
    }

    toast.info("Funcionalidade de convite em desenvolvimento");
    onOpenChange(false);
    setEmail("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Convidar Usuário</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="usuario@email.com" />
          </div>
          <p className="text-xs text-muted-foreground">
            Seu plano permite até {plan.maxUsers <= 0 ? "ilimitados" : plan.maxUsers} usuário(s).
          </p>
          <Button onClick={handleInvite} className="w-full" disabled={checking}>
            {checking ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Verificando limite...</> : "Enviar Convite"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
