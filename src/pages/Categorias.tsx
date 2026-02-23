import { Tags } from "lucide-react";
import { CrudPage, type FieldConfig } from "@/components/cadastro/CrudPage";
import { useProductCategories, useCreateProductCategory, useUpdateProductCategory, useDeleteProductCategory } from "@/hooks/useProductCategories";

const fields: FieldConfig[] = [
  { key: "name", label: "Nome", required: true, showInTable: true, colSpan: 2 },
  { key: "description", label: "Descrição", type: "textarea", showInTable: true, colSpan: 2 },
];

export default function Categorias() {
  const { data = [], isLoading } = useProductCategories();
  const create = useCreateProductCategory();
  const update = useUpdateProductCategory();
  const del = useDeleteProductCategory();

  return (
    <CrudPage
      title="Categorias"
      icon={<Tags className="w-5 h-5" />}
      data={data}
      isLoading={isLoading}
      fields={fields}
      onCreate={(d) => create.mutateAsync(d as any)}
      onUpdate={(d) => update.mutateAsync(d as any)}
      onDelete={(id) => del.mutateAsync(id)}
      searchKeys={["name", "description"]}
    />
  );
}
