import { ReactNode } from "react";

export interface FieldConfig {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  showInTable?: boolean;
  colSpan?: number;
  options?: { value: string; label: string }[];
  placeholder?: string;
  cnpjLookup?: boolean;
}

interface CrudPageProps {
  title: string;
  icon: ReactNode;
  data: any[];
  isLoading: boolean;
  fields: FieldConfig[];
  getFields?: (formData: Record<string, any>) => FieldConfig[];
  onValidate?: (data: Record<string, any>) => string | null;
  onCreate: (data: Record<string, any>) => Promise<any>;
  onUpdate: (data: Record<string, any>) => Promise<any>;
  onDelete: (id: string) => Promise<any>;
  searchKeys?: string[];
  cnpjFieldMap?: Record<string, string>;
  headerActions?: ReactNode;
}

export function CrudPage({ title, icon, data, isLoading, fields, headerActions }: CrudPageProps) {
  const tableFields = fields.filter(f => f.showInTable);

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon}
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">{title}</h1>
          <span className="text-sm text-muted-foreground">({data.length})</span>
        </div>
        {headerActions}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground text-sm">
          Nenhum registro encontrado.
        </div>
      ) : (
        <div className="bg-card rounded-xl card-shadow border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {tableFields.map(f => (
                    <th key={f.key} className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">{f.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((item: any) => (
                  <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    {tableFields.map(f => (
                      <td key={f.key} className="px-5 py-3 text-foreground">{item[f.key] ?? "—"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
