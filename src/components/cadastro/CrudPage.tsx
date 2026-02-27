import { ReactNode, useState, useEffect, useRef } from "react";
import { Plus, Pencil, Trash2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useCnpjLookup } from "@/hooks/useCnpjLookup";

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

function CurrencyInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const display = value ? parseFloat(value).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "";
  return (
    <Input
      value={display}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d,]/g, "").replace(",", ".");
        onChange(raw);
      }}
      placeholder="0,00"
    />
  );
}

export function CrudPage({
  title, icon, data, isLoading, fields, getFields, onValidate, onCreate, onUpdate, onDelete, searchKeys, cnpjFieldMap, headerActions,
}: CrudPageProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const activeFields = getFields ? getFields(formData) : fields;
  const tableFields = fields.filter((f) => f.showInTable);

  const { lookup: lookupCnpj, loading: cnpjLoading } = useCnpjLookup();

  const filteredData = search.trim()
    ? data.filter((item) => {
        const keys = searchKeys || tableFields.map((f) => f.key);
        return keys.some((k) => String(item[k] || "").toLowerCase().includes(search.toLowerCase()));
      })
    : data;

  const openCreate = () => {
    setEditingItem(null);
    setFormData({});
    setDialogOpen(true);
  };

  const openEdit = (item: any) => {
    setEditingItem(item);
    setFormData({ ...item });
    setDialogOpen(true);
  };

  const handleFieldChange = (key: string, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    // Auto CNPJ lookup when field has cnpjLookup and value has 14+ digits
    const field = activeFields.find(f => f.key === key);
    if (field?.cnpjLookup && cnpjFieldMap) {
      const clean = (value || "").replace(/\D/g, "");
      if (clean.length === 14) {
        triggerCnpjLookup(key, clean);
      }
    }
  };

  const cnpjLookupDoneRef = useRef<string>("");

  const triggerCnpjLookup = async (fieldKey: string, cleanCnpj: string) => {
    if (cnpjLookupDoneRef.current === cleanCnpj) return; // avoid duplicate lookups
    cnpjLookupDoneRef.current = cleanCnpj;
    const result = await lookupCnpj(cleanCnpj);
    if (result && cnpjFieldMap) {
      const mapped: Record<string, any> = {};
      for (const [apiKey, formKey] of Object.entries(cnpjFieldMap)) {
        if ((result as any)[apiKey]) mapped[formKey] = (result as any)[apiKey];
      }
      setFormData((prev) => ({ ...prev, ...mapped }));
      toast.success("Dados do CNPJ preenchidos automaticamente!");
    }
  };

  const handleCnpjLookup = async () => {
    // Try both cpf_cnpj and cnpj field names
    const cnpj = (formData.cpf_cnpj || formData.cnpj || "").replace(/\D/g, "");
    if (cnpj.length !== 14) {
      toast.error("CNPJ deve ter 14 dígitos");
      return;
    }
    cnpjLookupDoneRef.current = ""; // force re-lookup on manual click
    const fieldKey = formData.cpf_cnpj ? "cpf_cnpj" : "cnpj";
    await triggerCnpjLookup(fieldKey, cnpj);
  };

  const handleSave = async () => {
    if (onValidate) {
      const err = onValidate(formData);
      if (err) { toast.error(err); return; }
    }
    setSaving(true);
    try {
      if (editingItem) {
        await onUpdate({ ...formData, id: editingItem.id });
        toast.success("Registro atualizado!");
      } else {
        await onCreate(formData);
        toast.success("Registro criado!");
      }
      setDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await onDelete(id);
      toast.success("Registro excluído!");
      setDeleteConfirm(null);
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir");
    }
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon}
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">{title}</h1>
          <span className="text-sm text-muted-foreground">({filteredData.length})</span>
        </div>
        <div className="flex items-center gap-2">
          {headerActions}
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1" /> Novo
          </Button>
        </div>
      </div>

      {/* Search */}
      {data.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="pl-9"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredData.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground text-sm">
          Nenhum registro encontrado.
        </div>
      ) : (
        <div className="bg-card rounded-xl card-shadow border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {tableFields.map((f) => (
                    <th key={f.key} className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">{f.label}</th>
                  ))}
                  <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((item: any) => (
                  <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    {tableFields.map((f) => (
                      <td key={f.key} className="px-5 py-3 text-foreground">{item[f.key] ?? "—"}</td>
                    ))}
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(item)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => setDeleteConfirm(item.id)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Editar" : "Novo"} {title.replace(/s$/, "")}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 py-4">
            {activeFields.map((f) => (
              <div key={f.key} className={f.colSpan === 2 ? "sm:col-span-2" : ""}>
                <Label className="text-xs font-medium text-foreground mb-1.5 block">
                  {f.label}{f.required ? <span className="text-destructive ml-0.5">*</span> : ""}
                </Label>
                {f.type === "select" ? (
                  <select
                    value={formData[f.key] || ""}
                    onChange={(e) => handleFieldChange(f.key, e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    <option value="">Selecione</option>
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                ) : f.type === "textarea" ? (
                  <textarea
                    value={formData[f.key] || ""}
                    onChange={(e) => handleFieldChange(f.key, e.target.value)}
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 resize-none"
                    placeholder={f.placeholder}
                  />
                ) : f.type === "currency" ? (
                  <CurrencyInput value={formData[f.key] || ""} onChange={(v) => handleFieldChange(f.key, v)} />
                ) : (
                  <div className="flex gap-2">
                    <Input
                      type={f.type || "text"}
                      value={formData[f.key] || ""}
                      onChange={(e) => handleFieldChange(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      className="flex-1"
                    />
                    {f.cnpjLookup && (
                      <Button type="button" variant="outline" size="sm" onClick={handleCnpjLookup} disabled={cnpjLoading} className="shrink-0 h-10">
                        {cnpjLoading ? "..." : "Consultar"}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar exclusão</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
