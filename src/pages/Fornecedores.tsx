import { Factory } from "lucide-react";
import { CrudPage, type FieldConfig } from "@/components/cadastro/CrudPage";
import { useSuppliers, useCreateSupplier, useUpdateSupplier, useDeleteSupplier } from "@/hooks/useSuppliers";
import { useCallback } from "react";
import { validateDoc } from "@/lib/cpf-cnpj-validator";

const fields: FieldConfig[] = [
  { key: "name", label: "Razão Social", required: true, showInTable: true, colSpan: 2 },
  { key: "trade_name", label: "Nome Fantasia" },
  { key: "cnpj", label: "CNPJ", showInTable: true, cnpjLookup: true },
  { key: "ie", label: "Inscrição Estadual" },
  { key: "contact_name", label: "Contato", showInTable: true },
  { key: "email", label: "E-mail", type: "email", showInTable: true },
  { key: "phone", label: "Telefone", type: "tel", showInTable: true },
  { key: "address_street", label: "Rua" },
  { key: "address_number", label: "Número" },
  { key: "address_complement", label: "Complemento" },
  { key: "address_neighborhood", label: "Bairro" },
  { key: "address_city", label: "Cidade" },
  { key: "address_state", label: "UF" },
  { key: "address_zip", label: "CEP" },
  { key: "notes", label: "Observações", colSpan: 2 },
];

export default function Fornecedores() {
  const { data = [], isLoading } = useSuppliers();
  const create = useCreateSupplier();
  const update = useUpdateSupplier();
  const del = useDeleteSupplier();

  const onValidate = useCallback((data: Record<string, any>): string | null => {
    const cnpj = (data.cnpj || "").replace(/\D/g, "");
    if (!cnpj) return null;
    const result = validateDoc(cnpj);
    if (!result.valid) return result.error || "CNPJ inválido";
    return null;
  }, []);

  return (
    <CrudPage
      title="Fornecedores"
      icon={<Factory className="w-5 h-5" />}
      data={data}
      isLoading={isLoading}
      fields={fields}
      onValidate={onValidate}
      onCreate={(d) => create.mutateAsync(d as any)}
      onUpdate={(d) => update.mutateAsync(d as any)}
      onDelete={(id) => del.mutateAsync(id)}
      searchKeys={["name", "cnpj", "contact_name"] as any}
    />
  );
}
