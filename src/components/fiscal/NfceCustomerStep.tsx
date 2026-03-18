import { User } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";

interface NfceFormData {
  customerName: string;
  customerDoc: string;
  natOp: string;
  infAdic: string;
  items: unknown[];
  paymentMethod: string;
  paymentValue: number;
  change: number;
}

interface NfceCustomerStepProps {
  form: NfceFormData;
  setForm: Dispatch<SetStateAction<NfceFormData>>;
}

export function NfceCustomerStep({ form, setForm }: NfceCustomerStepProps) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Dados do consumidor (opcional para NFC-e até R$ 200,00)
      </p>
      <div>
        <label className="text-sm font-medium text-foreground">CPF / CNPJ</label>
        <input
          value={form.customerDoc}
          onChange={(e) => setForm((p) => ({ ...p, customerDoc: e.target.value }))}
          className="w-full mt-1 px-3 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="000.000.000-00"
        />
      </div>
      <div>
        <label className="text-sm font-medium text-foreground">Nome</label>
        <input
          value={form.customerName}
          onChange={(e) => setForm((p) => ({ ...p, customerName: e.target.value }))}
          className="w-full mt-1 px-3 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="Nome do consumidor"
        />
      </div>
      <div>
        <label className="text-sm font-medium text-foreground">Natureza da Operação</label>
        <input
          value={form.natOp}
          onChange={(e) => setForm((p) => ({ ...p, natOp: e.target.value }))}
          className="w-full mt-1 px-3 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
      <div>
        <label className="text-sm font-medium text-foreground">Informações Adicionais</label>
        <textarea
          value={form.infAdic}
          onChange={(e) => setForm((p) => ({ ...p, infAdic: e.target.value }))}
          rows={3}
          className="w-full mt-1 px-3 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="Informações complementares..."
        />
      </div>
    </div>
  );
}
