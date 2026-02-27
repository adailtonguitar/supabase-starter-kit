import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useCreateFinancialEntry, useUpdateFinancialEntry } from "@/hooks/useFinancialEntries";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencyInput } from "@/components/ui/currency-input";
import { X } from "lucide-react";

interface FinancialEntryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry?: any;
  defaultType?: "pagar" | "receber";
}

const categories = {
  pagar: [
    { value: "fornecedor", label: "Fornecedor" },
    { value: "aluguel", label: "Aluguel" },
    { value: "energia", label: "Energia" },
    { value: "agua", label: "Água" },
    { value: "internet", label: "Internet" },
    { value: "salario", label: "Salário" },
    { value: "impostos", label: "Impostos" },
    { value: "manutencao", label: "Manutenção" },
    { value: "outros", label: "Outros" },
  ],
  receber: [
    { value: "venda", label: "Venda" },
    { value: "servico", label: "Serviço" },
    { value: "comissao", label: "Comissão" },
    { value: "reembolso", label: "Reembolso" },
    { value: "outros", label: "Outros" },
  ],
};

export function FinancialEntryFormDialog({ open, onOpenChange, entry, defaultType = "pagar" }: FinancialEntryFormDialogProps) {
  const createEntry = useCreateFinancialEntry();
  const updateEntry = useUpdateFinancialEntry();
  const isEditing = !!entry;

  const [type, setType] = useState<"pagar" | "receber">(defaultType);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("outros");
  const [amount, setAmount] = useState(0);
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (entry) {
      setType(entry.type || defaultType);
      setDescription(entry.description || "");
      setCategory(entry.category || "outros");
      setAmount(Number(entry.amount) || 0);
      setDueDate(entry.due_date ? entry.due_date.split("T")[0] : "");
      setNotes(entry.notes || "");
    } else {
      setType(defaultType);
      setDescription("");
      setCategory("outros");
      setAmount(0);
      setDueDate(new Date().toISOString().split("T")[0]);
      setNotes("");
    }
  }, [entry, defaultType, open]);

  const handleSubmit = async () => {
    if (!description.trim()) { toast.error("Informe a descrição"); return; }
    if (amount <= 0) { toast.error("Informe um valor válido"); return; }
    if (!dueDate) { toast.error("Informe a data de vencimento"); return; }

    try {
      if (isEditing) {
        await updateEntry.mutateAsync({
          id: entry.id,
          type,
          description: description.trim(),
          category,
          amount,
          due_date: dueDate,
          notes: notes.trim() || null,
        });
      } else {
        await createEntry.mutateAsync({
          type,
          description: description.trim(),
          category,
          amount,
          due_date: dueDate,
          status: "pendente" as any,
          notes: notes.trim() || null,
        });
      }
      onOpenChange(false);
    } catch {
      // errors handled by hook toasts
    }
  };

  if (!open) return null;

  const saving = createEntry.isPending || updateEntry.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => onOpenChange(false)}>
      <div
        className="bg-card rounded-xl p-5 border border-border max-w-md w-full max-h-[90vh] overflow-y-auto space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            {isEditing ? "Editar Lançamento" : "Novo Lançamento"}
          </h2>
          <button onClick={() => onOpenChange(false)} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">Tipo</label>
            <Select value={type} onValueChange={(v) => { setType(v as any); setCategory("outros"); }}>
              <SelectTrigger className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pagar">A Pagar</SelectItem>
                <SelectItem value="receber">A Receber</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">Descrição *</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Aluguel da loja"
              className="form-input w-full h-12 px-3 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">Categoria</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories[type].map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">Valor (R$) *</label>
            <CurrencyInput
              value={amount}
              onChange={setAmount}
              className="h-12"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">Data de Vencimento *</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="form-input w-full h-12 px-3 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">Observações</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opcional"
              rows={2}
              className="form-input w-full px-3 py-2 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button className="flex-1" onClick={handleSubmit} disabled={saving}>
            {saving ? "Salvando..." : isEditing ? "Salvar" : "Criar Lançamento"}
          </Button>
        </div>
      </div>
    </div>
  );
}
