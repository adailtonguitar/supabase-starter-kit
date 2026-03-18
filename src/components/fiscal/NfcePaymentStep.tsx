import type { Dispatch, SetStateAction } from "react";
import { formatCurrency } from "@/lib/utils";

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

interface PaymentOption {
  value: string;
  label: string;
}

interface NfcePaymentStepProps {
  form: NfceFormData;
  setForm: Dispatch<SetStateAction<NfceFormData>>;
  totalItems: number;
  paymentOptions: PaymentOption[];
}

export function NfcePaymentStep({ form, setForm, totalItems, paymentOptions }: NfcePaymentStepProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium text-foreground">Forma de Pagamento</label>
        <select
          value={form.paymentMethod}
          onChange={(e) => setForm((p) => ({ ...p, paymentMethod: e.target.value }))}
          className="w-full mt-1 px-3 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          {paymentOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-sm font-medium text-foreground">Valor Pago</label>
        <input
          type="number"
          value={form.paymentValue}
          onChange={(e) => {
            const val = parseFloat(e.target.value) || 0;
            setForm((p) => ({ ...p, paymentValue: val, change: Math.max(0, val - totalItems) }));
          }}
          className="w-full mt-1 px-3 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
          min="0"
          step="0.01"
        />
      </div>
      <div>
        <label className="text-sm font-medium text-foreground">Troco</label>
        <input
          type="number"
          value={form.change}
          onChange={(e) => setForm((p) => ({ ...p, change: parseFloat(e.target.value) || 0 }))}
          className="w-full mt-1 px-3 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
          min="0"
          step="0.01"
        />
      </div>
    </div>
  );
}
