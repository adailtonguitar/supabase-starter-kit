import { CreditCard } from "lucide-react";
import { CrudPage, type FieldConfig } from "@/components/cadastro/CrudPage";
import { useCardAdmins, useCreateCardAdmin, useUpdateCardAdmin, useDeleteCardAdmin } from "@/hooks/useCardAdmins";

const fields: FieldConfig[] = [
  { key: "name", label: "Nome", required: true, showInTable: true, colSpan: 2 },
  { key: "cnpj", label: "CNPJ", showInTable: true, cnpjLookup: true },
  { key: "credit_fee", label: "Taxa Crédito (%)", type: "number", showInTable: true },
  { key: "debit_fee", label: "Taxa Débito (%)", type: "number", showInTable: true },
  { key: "settlement_days", label: "Prazo Recebimento (dias)", type: "number", showInTable: true },
];

export default function AdmCartoes() {
  const { data = [], isLoading } = useCardAdmins();
  const create = useCreateCardAdmin();
  const update = useUpdateCardAdmin();
  const del = useDeleteCardAdmin();

  return (
    <CrudPage
      title="Adm. Cartões"
      icon={<CreditCard className="w-5 h-5" />}
      data={data}
      isLoading={isLoading}
      fields={fields}
      onCreate={(d) => create.mutateAsync(d as any)}
      onUpdate={(d) => update.mutateAsync(d as any)}
      onDelete={(id) => del.mutateAsync(id)}
      searchKeys={["name", "cnpj"]}
      cnpjFieldMap={{
        name: "name",
      }}
    />
  );
}
