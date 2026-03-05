import { ReactNode, useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Plus, Pencil, Trash2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useCnpjLookup } from "@/hooks/useCnpjLookup";

import { maskCpfCnpj, DOC_FIELD_KEYS } from "@/lib/cpf-cnpj-mask";

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
    const masked = { ...item };
    DOC_FIELD_KEYS.forEach((k) => { if (masked[k]) masked[k] = maskCpfCnpj(masked[k]); });
    setFormData(masked);
    setDialogOpen(true);
  };

  const handleFieldChange = (key: string, value: any) => {
    const isDocField = DOC_FIELD_KEYS.includes(key);
    const finalValue = isDocField ? maskCpfCnpj(value) : value;
    setFormData((prev) => ({ ...prev, [key]: finalValue }));
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
    // Validate required fields
    const missingRequired = activeFields.filter(f => f.required && !formData[f.key]?.toString().trim());
    if (missingRequired.length > 0) {
      toast.error(`Preencha o campo obrigatório: ${missingRequired[0].label}`);
      return;
    }
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
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="text-primary">{icon}</div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">{title}</h1>
          <span className="text-sm text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">({filteredData.length})</span>
        </div>
        <div className="flex items-center gap-2">
          {headerActions}
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1" /> Novo
          </Button>
        </div>
      </motion.div>

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
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-20">
          <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <Search className="w-7 h-7 text-muted-foreground/50" />
          </div>
          <p className="text-sm font-medium text-foreground">Nenhum registro encontrado</p>
          <p className="text-xs text-muted-foreground mt-1">Clique em "Novo" para cadastrar.</p>
        </motion.div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {filteredData.map((item: any) => (
              <motion.div key={item.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: filteredData.indexOf(item) * 0.03 }} className="bg-card rounded-2xl border border-border p-3 space-y-2 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    {tableFields.slice(0, 3).map((f) => (
                      <p key={f.key} className={`text-sm ${f === tableFields[0] ? "font-medium text-foreground" : "text-muted-foreground text-xs"} truncate`}>
                        {f === tableFields[0] ? (item[f.key] ?? "—") : `${f.label}: ${item[f.key] ?? "—"}`}
                      </p>
                    ))}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openEdit(item)} className="p-2.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors active:scale-95">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => setDeleteConfirm(item.id)} className="p-2.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors active:scale-95">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {tableFields.length > 3 && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 border-t border-border text-xs text-muted-foreground">
                    {tableFields.slice(3).map((f) => (
                      <span key={f.key} className="truncate max-w-[150px]">{f.label}: {item[f.key] ?? "—"}</span>
                    ))}
                  </div>
                )}
              </motion.div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-card rounded-2xl card-shadow border border-border overflow-hidden">
            <div className="overflow-x-auto md:overflow-x-visible">
              <table className="w-full text-sm table-fixed">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {tableFields.map((f) => (
                      <th key={f.key} className="text-left px-3 sm:px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-widest truncate">{f.label}</th>
                    ))}
                    <th className="text-right px-3 sm:px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-widest w-20">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((item: any) => (
                    <tr key={item.id} className={`border-b border-border last:border-0 hover:bg-primary/[0.03] transition-colors ${filteredData.indexOf(item) % 2 === 1 ? "bg-muted/15" : ""}`}>
                      {tableFields.map((f) => (
                        <td key={f.key} className="px-3 sm:px-5 py-3 text-foreground truncate">{item[f.key] ?? "—"}</td>
                      ))}
                      <td className="px-3 sm:px-5 py-3 text-right">
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
        </>
      )}

      {/* Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl w-[calc(100%-2rem)]">
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
                  <CurrencyInput value={parseFloat(formData[f.key]) || 0} onChange={(v) => handleFieldChange(f.key, v)} />
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
