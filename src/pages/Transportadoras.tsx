import { Truck } from "lucide-react";
import { CrudPage, type FieldConfig } from "@/components/cadastro/CrudPage";
import { useCarriers, useCreateCarrier, useUpdateCarrier, useDeleteCarrier } from "@/hooks/useCarriers";

const fields: FieldConfig[] = [
  { key: "name", label: "Razão Social", required: true, showInTable: true, colSpan: 2 },
  { key: "trade_name", label: "Nome Fantasia", showInTable: true },
  { key: "cnpj", label: "CNPJ", showInTable: true, cnpjLookup: true },
  { key: "ie", label: "Inscrição Estadual" },
  { key: "contact_name", label: "Contato", showInTable: true },
  { key: "email", label: "E-mail", type: "email", showInTable: true },
  { key: "phone", label: "Telefone", type: "tel", showInTable: true },
  { key: "notes", label: "Observações", type: "textarea", colSpan: 2 },
];

export default function Transportadoras() {
  const { data = [], isLoading } = useCarriers();
  const create = useCreateCarrier();
  const update = useUpdateCarrier();
  const del = useDeleteCarrier();

  return (
    <CrudPage
      title="Transportadoras"
      icon={<Truck className="w-5 h-5" />}
      data={data}
      isLoading={isLoading}
      fields={fields}
      onCreate={(d) => create.mutateAsync(d as any)}
      onUpdate={(d) => update.mutateAsync(d as any)}
      onDelete={(id) => del.mutateAsync(id)}
      searchKeys={["name", "cnpj", "contact_name"]}
      cnpjFieldMap={{
        name: "name",
        trade_name: "trade_name",
        email: "email",
        phone: "phone",
        contact_name: "contact_name",
      }}
    />
  );
}
