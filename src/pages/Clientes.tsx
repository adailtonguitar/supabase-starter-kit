import { useState, useCallback } from "react";
import { Users, Upload, User, Phone, Mail, MapPin, CreditCard, AlertTriangle, Search, Plus, Pencil, Trash2, X } from "lucide-react";
import { useClients, useCreateClient, useUpdateClient, useDeleteClient } from "@/hooks/useClients";
import { validateDoc } from "@/lib/cpf-cnpj-validator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CSVClientImportDialog } from "@/components/clients/CSVClientImportDialog";
import { toast } from "sonner";
import { useCnpjLookup } from "@/hooks/useCnpjLookup";

function maskCpfCnpj(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 11) {
    return digits.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return digits.slice(0, 14).replace(/(\d{2})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const DOC_FIELD_KEYS = ["cnpj", "cpf", "cpf_cnpj"];

interface FieldConfig {
  key: string; label: string; type?: string; required?: boolean; colSpan?: number;
  options?: { value: string; label: string }[]; placeholder?: string; cnpjLookup?: boolean;
}

const baseFields: FieldConfig[] = [
  { key: "tipo_pessoa", label: "Tipo de Pessoa", type: "select", required: true, options: [{ value: "pf", label: "Pessoa Física" }, { value: "pj", label: "Pessoa Jurídica" }] },
  { key: "name", label: "Nome / Razão Social", required: true, colSpan: 2 },
  { key: "trade_name", label: "Nome Fantasia" },
  { key: "cpf_cnpj", label: "CPF", required: true },
  { key: "ie", label: "Inscrição Estadual" },
  { key: "email", label: "E-mail", type: "email" },
  { key: "phone", label: "Telefone", type: "tel" },
  { key: "phone2", label: "Telefone 2", type: "tel" },
  { key: "credit_limit", label: "Limite de Crédito (R$)", type: "currency" },
  { key: "credit_balance", label: "Saldo Devedor (R$)", type: "currency" },
  { key: "address_zip", label: "CEP" },
  { key: "address_street", label: "Rua" },
  { key: "address_number", label: "Número" },
  { key: "address_complement", label: "Complemento" },
  { key: "address_neighborhood", label: "Bairro" },
  { key: "address_city", label: "Cidade" },
  { key: "address_state", label: "UF" },
  { key: "notes", label: "Observações", type: "textarea", colSpan: 2 },
];

function CurrencyInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const display = value ? parseFloat(value).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "";
  return (
    <Input value={display} onChange={(e) => { const raw = e.target.value.replace(/[^\d,]/g, "").replace(",", "."); onChange(raw); }} placeholder="0,00" />
  );
}

export default function Clientes() {
  const { data = [], isLoading } = useClients();
  const create = useCreateClient();
  const update = useUpdateClient();
  const del = useDeleteClient();
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const { lookup: lookupCnpj, loading: cnpjLoading } = useCnpjLookup();

  const cnpjFieldMap: Record<string, string> = { name: "name", trade_name: "trade_name", email: "email", phone: "phone", address_street: "address_street", address_number: "address_number", address_complement: "address_complement", address_neighborhood: "address_neighborhood", address_city: "address_city", address_state: "address_state", address_zip: "address_zip" };

  const getFields = useCallback((fd: Record<string, any>): FieldConfig[] => {
    const isPJ = fd.tipo_pessoa === "pj";
    return baseFields.map((f) => {
      if (f.key === "cpf_cnpj") return { ...f, label: isPJ ? "CNPJ" : "CPF", placeholder: isPJ ? "00.000.000/0000-00" : "000.000.000-00", cnpjLookup: isPJ };
      if (f.key === "name") return { ...f, label: isPJ ? "Razão Social" : "Nome Completo" };
      if (f.key === "trade_name") return { ...f, label: isPJ ? "Nome Fantasia" : "Apelido" };
      return f;
    });
  }, []);

  const activeFields = getFields(formData);

  const filtered = search.trim()
    ? data.filter((c: any) => c.name?.toLowerCase().includes(search.toLowerCase()) || c.cpf_cnpj?.includes(search) || c.email?.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search))
    : data;

  const openCreate = () => { setEditingItem(null); setFormData({}); setDialogOpen(true); };
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
    const field = activeFields.find(f => f.key === key);
    if (field?.cnpjLookup) {
      const clean = (value || "").replace(/\D/g, "");
      if (clean.length === 14) handleCnpjLookup(clean);
    }
  };

  const handleCnpjLookup = async (cnpjOverride?: string) => {
    const cnpj = cnpjOverride || (formData.cpf_cnpj || "").replace(/\D/g, "");
    if (cnpj.length !== 14) { toast.error("CNPJ deve ter 14 dígitos"); return; }
    const result = await lookupCnpj(cnpj);
    if (result) {
      const mapped: Record<string, any> = {};
      for (const [apiKey, formKey] of Object.entries(cnpjFieldMap)) { if ((result as any)[apiKey]) mapped[formKey] = (result as any)[apiKey]; }
      setFormData((prev) => ({ ...prev, ...mapped }));
      toast.success("Dados do CNPJ preenchidos!");
    }
  };

  const onValidate = (d: Record<string, any>): string | null => {
    const doc = (d.cpf_cnpj || "").replace(/\D/g, "");
    if (!doc) return null;
    const isPJ = d.tipo_pessoa === "pj";
    if (isPJ && doc.length !== 14) return "CNPJ deve ter 14 dígitos";
    if (!isPJ && doc.length !== 11) return "CPF deve ter 11 dígitos";
    const result = validateDoc(doc);
    if (!result.valid) return result.error || "Documento inválido";
    return null;
  };

  const handleSave = async () => {
    const err = onValidate(formData);
    if (err) { toast.error(err); return; }
    setSaving(true);
    try {
      if (editingItem) { await update.mutateAsync({ ...formData, id: editingItem.id }); toast.success("Cliente atualizado!"); }
      else { await create.mutateAsync(formData); toast.success("Cliente criado!"); }
      setDialogOpen(false);
    } catch (e: any) { toast.error(e.message || "Erro ao salvar"); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try { await del.mutateAsync(id); toast.success("Cliente excluído!"); setDeleteConfirm(null); }
    catch (e: any) { toast.error(e.message || "Erro ao excluir"); }
  };

  const getCreditStatus = (client: any) => {
    const limit = Number(client.credit_limit || 0);
    const balance = Number(client.credit_balance || 0);
    if (limit === 0) return null;
    const used = balance / limit;
    if (used >= 1) return { label: "Limite atingido", variant: "destructive" as const, pct: 100 };
    if (used >= 0.8) return { label: "Próximo do limite", variant: "secondary" as const, pct: Math.round(used * 100) };
    return { label: `${Math.round(used * 100)}% usado`, variant: "outline" as const, pct: Math.round(used * 100) };
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" /> Clientes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length} cliente{filtered.length !== 1 ? "s" : ""} cadastrado{filtered.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowCSVImport(true)}>
            <Upload className="w-4 h-4 mr-1.5" /> Importar CSV
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1.5" /> Novo Cliente
          </Button>
        </div>
      </div>

      {/* Search */}
      {data.length > 0 && (
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, CPF/CNPJ, e-mail ou telefone..." className="pl-10" />
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
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-muted-foreground">Nenhum cliente encontrado.</p>
          <p className="text-xs text-muted-foreground mt-1">Clique em "Novo Cliente" para cadastrar.</p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {filtered.map((c: any) => {
              const credit = getCreditStatus(c);
              const limit = Number(c.credit_limit || 0);
              const balance = Number(c.credit_balance || 0);
              return (
                <div key={c.id} className="bg-card rounded-xl border border-border p-3.5 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <User className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.cpf_cnpj ? maskCpfCnpj(c.cpf_cnpj) : "Sem documento"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button onClick={() => openEdit(c)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => setDeleteConfirm(c.id)} className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>

                  {/* Contact info */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
                    {c.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</span>}
                    {c.address_city && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{c.address_city}{c.address_state ? ` - ${c.address_state}` : ""}</span>}
                  </div>

                  {/* Credit info */}
                  {limit > 0 && (
                    <div className="pt-2 border-t border-border">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs text-muted-foreground flex items-center gap-1"><CreditCard className="w-3 h-3" /> Crédito</span>
                        {credit && <Badge variant={credit.variant} className="text-[10px] px-1.5 py-0">{credit.label}</Badge>}
                      </div>
                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${credit && credit.pct >= 100 ? "bg-destructive" : credit && credit.pct >= 80 ? "bg-warning" : "bg-primary"}`}
                          style={{ width: `${Math.min(credit?.pct || 0, 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                        <span>Usado: {fmt(balance)}</span>
                        <span>Limite: {fmt(limit)}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-card rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Cliente</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Contato</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Cidade</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Limite</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Saldo Devedor</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Status Crédito</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground w-24">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c: any) => {
                  const credit = getCreditStatus(c);
                  const limit = Number(c.credit_limit || 0);
                  const balance = Number(c.credit_balance || 0);
                  return (
                    <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-foreground">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.cpf_cnpj ? maskCpfCnpj(c.cpf_cnpj) : "—"}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-0.5">
                          {c.phone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</p>}
                          {c.email && <p className="text-xs text-muted-foreground flex items-center gap-1 truncate max-w-[180px]"><Mail className="w-3 h-3" />{c.email}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-sm">
                        {c.address_city ? `${c.address_city}${c.address_state ? ` - ${c.address_state}` : ""}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-foreground">
                        {limit > 0 ? fmt(limit) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm">
                        {balance > 0 ? <span className="text-destructive font-semibold">{fmt(balance)}</span> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {credit ? (
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${credit.pct >= 100 ? "bg-destructive" : credit.pct >= 80 ? "bg-warning" : "bg-primary"}`}
                                style={{ width: `${Math.min(credit.pct, 100)}%` }}
                              />
                            </div>
                            <span className={`text-xs ${credit.pct >= 100 ? "text-destructive" : credit.pct >= 80 ? "text-warning" : "text-muted-foreground"}`}>
                              {credit.pct}%
                            </span>
                          </div>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => setDeleteConfirm(c.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl w-[calc(100%-2rem)]">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Editar" : "Novo"} Cliente</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 py-4">
            {activeFields.map((f) => (
              <div key={f.key} className={f.colSpan === 2 ? "sm:col-span-2" : ""}>
                <Label className="text-xs font-medium text-foreground mb-1.5 block">
                  {f.label}{f.required ? <span className="text-destructive ml-0.5">*</span> : ""}
                </Label>
                {f.type === "select" ? (
                  <select value={formData[f.key] || ""} onChange={(e) => handleFieldChange(f.key, e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                    <option value="">Selecione</option>
                    {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : f.type === "textarea" ? (
                  <textarea value={formData[f.key] || ""} onChange={(e) => handleFieldChange(f.key, e.target.value)}
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 resize-none" placeholder={f.placeholder} />
                ) : f.type === "currency" ? (
                  <CurrencyInput value={formData[f.key] || ""} onChange={(v) => handleFieldChange(f.key, v)} />
                ) : (
                  <div className="flex gap-2">
                    <Input type={f.type || "text"} value={formData[f.key] || ""} onChange={(e) => handleFieldChange(f.key, e.target.value)} placeholder={f.placeholder} className="flex-1" />
                    {f.cnpjLookup && (
                      <Button type="button" variant="outline" size="sm" onClick={() => handleCnpjLookup()} disabled={cnpjLoading} className="shrink-0 h-10">
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
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirmar exclusão</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir este cliente? Esta ação não pode ser desfeita.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CSVClientImportDialog open={showCSVImport} onOpenChange={setShowCSVImport} />
    </div>
  );
}
