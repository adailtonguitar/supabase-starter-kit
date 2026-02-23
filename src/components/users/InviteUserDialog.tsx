import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function InviteUserDialog({ open, onOpenChange }: Props) {
  const [email, setEmail] = useState("");

  const handleInvite = () => {
    if (!email.trim()) { toast.warning("Informe o email"); return; }
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
          <Button onClick={handleInvite} className="w-full">Enviar Convite</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
