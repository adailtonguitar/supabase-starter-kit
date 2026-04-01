import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Search, X, UserPlus, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { maskCpfCnpj } from "@/lib/cpf-cnpj-mask";
import { validateDoc } from "@/lib/cpf-cnpj-validator";
import { toast } from "sonner";

const getFiscalDocStatus = (doc?: string) => {
  const clean = (doc || "").replace(/\D/g, "");
  return {
    clean,
    valid: clean.length === 11 || clean.length === 14,
  };
};

interface Client {
  id: string;
  name: string;
  cpf_cnpj?: string;
  phone?: string;
}

interface PDVLoyaltyClientListProps {
  onSelect: (client: Client) => void;
}

export function PDVLoyaltyClientList({ onSelect }: PDVLoyaltyClientListProps) {
  const { companyId } = useCompany();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCpf, setNewCpf] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [editingDoc, setEditingDoc] = useState("");
  const [savingDoc, setSavingDoc] = useState(false);
  const [pendingSelectClientId, setPendingSelectClientId] = useState<string | null>(null);
  const quickAddDoc = getFiscalDocStatus(newCpf);
  const quickAddDocValidation = quickAddDoc.clean ? validateDoc(quickAddDoc.clean) : null;
  const editingDocStatus = getFiscalDocStatus(editingDoc);
  const editingDocValidation = editingDocStatus.clean ? validateDoc(editingDocStatus.clean) : null;

  useEffect(() => {
    if (!companyId) return;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("clients")
        .select("id, name, cpf_cnpj, phone")
        .eq("company_id", companyId)
        .order("name")
        .limit(500);
      setClients((data as Client[]) || []);
      setLoading(false);
    };
    load();
  }, [companyId]);

  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.cpf_cnpj && c.cpf_cnpj.includes(q)) ||
      (c.phone && c.phone.includes(q))
    );
  }, [clients, search]);

  const handleQuickAdd = async () => {
    if (!newName.trim()) {
      toast.error("Informe o nome do cliente");
      return;
    }
    if (quickAddDoc.clean && !quickAddDocValidation?.valid) {
      toast.error(quickAddDocValidation?.error || "CPF/CNPJ inválido");
      return;
    }
    if (!companyId) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("clients")
        .insert({
          name: newName.trim(),
          cpf_cnpj: quickAddDoc.clean || null,
          phone: newPhone.trim() || null,
          company_id: companyId,
        })
        .select("id, name, cpf_cnpj, phone")
        .single();
      if (error) throw error;
      const client = data as Client;
      setClients(prev => [...prev, client].sort((a, b) => a.name.localeCompare(b.name)));
      toast.success("Cliente cadastrado!");
      onSelect(client);
    } catch (err: any) {
      toast.error("Erro ao cadastrar: " + (err.message || ""));
    } finally {
      setSaving(false);
    }
  };

  const startEditDoc = (client: Client) => {
    setEditingClientId(client.id);
    setEditingDoc(maskCpfCnpj(client.cpf_cnpj || ""));
  };

  const cancelEditDoc = () => {
    setEditingClientId(null);
    setEditingDoc("");
  };

  const saveClientDoc = async (client: Client) => {
    if (!companyId) return;
    if (editingDocStatus.clean && !editingDocValidation?.valid) {
      toast.error(editingDocValidation?.error || "CPF/CNPJ inválido");
      return;
    }

    setSavingDoc(true);
    try {
      const cleanDoc = editingDocStatus.clean || null;
      const { error } = await supabase
        .from("clients")
        .update({ cpf_cnpj: cleanDoc })
        .eq("id", client.id)
        .eq("company_id", companyId);
      if (error) throw error;

      setClients((prev) => prev.map((item) => (
        item.id === client.id
          ? { ...item, cpf_cnpj: cleanDoc || undefined }
          : item
      )));
      toast.success("Documento do cliente atualizado!");
      if (pendingSelectClientId === client.id && cleanDoc) {
        onSelect({ ...client, cpf_cnpj: cleanDoc });
      }
      setPendingSelectClientId(null);
      cancelEditDoc();
    } catch (err: any) {
      toast.error("Erro ao atualizar documento: " + (err.message || ""));
    } finally {
      setSavingDoc(false);
    }
  };

  const handleSelectClient = (client: Client) => {
    if (getFiscalDocStatus(client.cpf_cnpj).valid) {
      setPendingSelectClientId(null);
      onSelect(client);
      return;
    }
    setPendingSelectClientId(client.id);
    startEditDoc(client);
    toast.info("Informe um CPF/CNPJ válido para usar este cliente na NFC-e identificada.");
  };

  if (showQuickAdd) {
    return (
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-foreground">Cadastro Rápido</h3>
          <button onClick={() => setShowQuickAdd(false)} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-2">
          <Input placeholder="Nome *" value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
          <Input
            placeholder="CPF/CNPJ"
            value={newCpf}
            onChange={e => setNewCpf(maskCpfCnpj(e.target.value))}
            inputMode="numeric"
          />
          {quickAddDoc.clean ? (
            <p className={`text-[11px] ${quickAddDocValidation?.valid ? "text-emerald-600 dark:text-emerald-300" : "text-destructive"}`}>
              {quickAddDocValidation?.valid ? "Documento válido para NFC-e identificada." : quickAddDocValidation?.error}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Se informar um CPF/CNPJ válido, o cliente já ficará apto para NFC-e identificada.
            </p>
          )}
          <Input placeholder="Telefone" value={newPhone} onChange={e => setNewPhone(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowQuickAdd(false)}>Cancelar</Button>
          <Button size="sm" className="flex-1" onClick={handleQuickAdd} disabled={saving || (quickAddDoc.clean.length > 0 && !quickAddDocValidation?.valid)}>
            {saving ? "Salvando..." : "Salvar e Selecionar"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col max-h-[60vh]">
      <div className="p-3 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, CPF ou telefone..."
            autoFocus
            className="w-full pl-10 pr-8 py-2 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>
        <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => setShowQuickAdd(true)}>
          <UserPlus className="w-3.5 h-3.5 mr-1.5" /> Cadastro rápido
        </Button>
        <p className="text-[11px] text-muted-foreground">
          Clientes com CPF/CNPJ valido aparecem como aptos para NFC-e identificada.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto border-t border-border">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {search ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
          </div>
        ) : (
          filtered.map(c => {
            const fiscalDoc = getFiscalDocStatus(c.cpf_cnpj);
            const isEditing = editingClientId === c.id;
            return (
              <div key={c.id} className="px-4 py-2.5 border-b border-border/50">
                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={() => handleSelectClient(c)}
                    className="min-w-0 flex-1 text-left hover:bg-primary/10 rounded-lg px-1 py-1 transition-colors"
                  >
                    <p className="text-sm font-medium text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.cpf_cnpj ? `Doc: ${maskCpfCnpj(c.cpf_cnpj)}` : "Sem documento"}
                      {(c.cpf_cnpj || c.phone) && c.cpf_cnpj && c.phone && " · "}
                      {c.phone && `Tel: ${c.phone}`}
                    </p>
                  </button>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-semibold border ${
                        fiscalDoc.valid
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20"
                      }`}
                    >
                      {fiscalDoc.valid ? "NFC-e identificada" : "Sem doc fiscal"}
                    </span>
                    <button
                      onClick={() => startEditDoc(c)}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      title="Editar CPF/CNPJ"
                    >
                      <Pencil className="w-3 h-3" />
                      Editar
                    </button>
                  </div>
                </div>
                {isEditing && (
                  <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                    <Input
                      placeholder="CPF/CNPJ"
                      value={editingDoc}
                      onChange={(e) => setEditingDoc(maskCpfCnpj(e.target.value))}
                      inputMode="numeric"
                    />
                    {editingDocStatus.clean ? (
                      <p className={`text-[11px] ${editingDocValidation?.valid ? "text-emerald-600 dark:text-emerald-300" : "text-destructive"}`}>
                        {editingDocValidation?.valid ? "Documento válido para NFC-e identificada." : editingDocValidation?.error}
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        Deixe em branco para remover o documento do cliente.
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={cancelEditDoc} disabled={savingDoc}>
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => saveClientDoc(c)}
                        disabled={savingDoc || (editingDocStatus.clean.length > 0 && !editingDocValidation?.valid)}
                      >
                        {savingDoc ? "Salvando..." : "Salvar documento"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
