import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Search, X, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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
    if (!companyId) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("clients")
        .insert({
          name: newName.trim(),
          cpf_cnpj: newCpf.trim() || null,
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
          <Input placeholder="CPF/CNPJ" value={newCpf} onChange={e => setNewCpf(e.target.value)} />
          <Input placeholder="Telefone" value={newPhone} onChange={e => setNewPhone(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowQuickAdd(false)}>Cancelar</Button>
          <Button size="sm" className="flex-1" onClick={handleQuickAdd} disabled={saving}>
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
      </div>

      <div className="flex-1 overflow-y-auto border-t border-border">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {search ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
          </div>
        ) : (
          filtered.map(c => (
            <button
              key={c.id}
              onClick={() => onSelect(c)}
              className="w-full text-left px-4 py-2.5 border-b border-border/50 hover:bg-primary/10 transition-colors flex items-center justify-between"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {c.cpf_cnpj && `Doc: ${c.cpf_cnpj}`}
                  {c.cpf_cnpj && c.phone && " · "}
                  {c.phone && `Tel: ${c.phone}`}
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
