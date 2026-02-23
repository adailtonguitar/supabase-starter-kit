import { Users } from "lucide-react";
import { CrudPage, type FieldConfig } from "@/components/cadastro/CrudPage";
import { useEmployees, useCreateEmployee, useUpdateEmployee, useDeleteEmployee } from "@/hooks/useEmployees";

const fields: FieldConfig[] = [
  { key: "name", label: "Nome", required: true, showInTable: true, colSpan: 2 },
  { key: "role", label: "Cargo", showInTable: true },
  { key: "department", label: "Departamento", showInTable: true },
  { key: "phone", label: "Telefone", type: "tel", showInTable: true },
  { key: "email", label: "E-mail", type: "email", showInTable: true },
  { key: "cpf", label: "CPF" },
  { key: "salary", label: "Salário", type: "currency" },
  { key: "hire_date", label: "Data Admissão", type: "date" },
  { key: "notes", label: "Observações", type: "textarea", colSpan: 2 },
];

export default function Funcionarios() {
  const { data = [], isLoading } = useEmployees();
  const create = useCreateEmployee();
  const update = useUpdateEmployee();
  const del = useDeleteEmployee();

  return (
    <CrudPage
      title="Funcionários"
      icon={<Users className="w-5 h-5" />}
      data={data}
      isLoading={isLoading}
      fields={fields}
      onCreate={(d) => create.mutateAsync(d as any)}
      onUpdate={(d) => update.mutateAsync(d as any)}
      onDelete={(id) => del.mutateAsync(id)}
      searchKeys={["name", "role", "department"]}
    />
  );
}
