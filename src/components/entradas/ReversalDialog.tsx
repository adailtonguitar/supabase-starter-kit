import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface ReversalDialogProps {
  entryId: string;
  supplierName: string | null;
  onConfirm: (id: string, reason: string) => void;
  isLoading?: boolean;
}

export default function ReversalDialog({ entryId, supplierName, onConfirm, isLoading }: ReversalDialogProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const handleConfirm = () => {
    onConfirm(entryId, reason.trim());
    setOpen(false);
    setReason("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="icon"
          variant="outline"
          className="h-8 w-8 bg-orange-500/10 text-orange-600 hover:bg-orange-500/20"
          title="Estornar entrada"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Estornar entrada</DialogTitle>
          <DialogDescription>
            Esta ação reverterá o estoque dos produtos importados via{" "}
            <strong>{supplierName || "fornecedor desconhecido"}</strong>.
            O registro será mantido como "Estornado" para auditoria.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reason">Motivo do estorno *</Label>
          <Textarea
            id="reason"
            placeholder="Ex: Nota fiscal emitida com erro, mercadoria devolvida..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            variant="destructive"
            disabled={reason.trim().length < 5 || isLoading}
            onClick={handleConfirm}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Confirmar estorno
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
