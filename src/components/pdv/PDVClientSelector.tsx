import { useState, useMemo } from "react";
import { Search, User, AlertTriangle, CreditCard, ShoppingBag } from "lucide-react";
import { useClients } from "@/hooks/useClients";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface CreditClient {
  id: string;
  name: string;
  cpf?: string;
  credit_limit?: number;
  credit_used?: number;
}

interface PDVClientSelectorProps {
  open: boolean;
  onClose: () => void;
  onSelect: (client: CreditClient, mode: "fiado", installments: number) => void;
  saleTotal: number;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

export function PDVClientSelector({ open, onClose, onSelect, saleTotal }: PDVClientSelectorProps) {
  const { data: clients = [] } = useClients();
  const [search, setSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const filteredClients = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter(
      (c: any) =>
        c.name?.toLowerCase().includes(q) ||
        c.cpf_cnpj?.includes(search)
    );
  }, [clients, search]);

  const selectedClient = clients.find((c: any) => c.id === selectedClientId) as any;
  const creditLimit = Number(selectedClient?.credit_limit || 0);
  const creditBalance = Number(selectedClient?.credit_balance || 0);
  const availableCredit = creditLimit > 0 ? creditLimit - creditBalance : Infinity;
  const exceedsLimit = creditLimit > 0 && saleTotal > availableCredit;

  const handleConfirm = () => {
    if (!selectedClient) return;
    const mapped: CreditClient = {
      id: selectedClient.id,
      name: selectedClient.name,
      cpf: selectedClient.cpf_cnpj,
      credit_limit: creditLimit,
      credit_used: creditBalance,
    };
    onSelect(mapped, "fiado", 1);
  };

  const reset = () => {
    setSearch("");
    setSelectedClientId(null);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 sm:p-4"
      onClick={() => { reset(); onClose(); }}
    >
      <div
        className="bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl w-full sm:max-w-lg max-h-[92vh] sm:max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle mobile */}
        <div className="sm:hidden mx-auto w-12 h-1.5 rounded-full bg-muted-foreground/30 mt-2 mb-1" />

        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Venda a Prazo</h2>
                <p className="text-xs text-muted-foreground">
                  Total: <span className="font-semibold text-foreground">{formatCurrency(saleTotal)}</span>
                </p>
              </div>
            </div>
            <button
              onClick={() => { reset(); onClose(); }}
              className="text-muted-foreground hover:text-foreground text-xl leading-none px-2"
            >
              ✕
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente por nome ou CPF/CNPJ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
              autoFocus
            />
          </div>
        </div>

        {/* Content */}
        {!selectedClient ? (
          /* Client List */
          <div className="flex-1 overflow-y-auto p-3 space-y-1 min-h-[200px] max-h-[50vh]">
            {filteredClients.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <User className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm">
                  {search ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
                </p>
              </div>
            ) : (
              filteredClients.map((client: any) => {
                const balance = Number(client.credit_balance || 0);
                const limit = Number(client.credit_limit || 0);
                const available = limit > 0 ? limit - balance : Infinity;
                const wouldExceed = limit > 0 && saleTotal > available;

                return (
                  <button
                    key={client.id}
                    onClick={() => setSelectedClientId(client.id)}
                    className="w-full flex items-center justify-between p-3 rounded-xl text-left transition-all hover:bg-muted border border-transparent hover:border-border"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{client.name}</p>
                        <p className="text-xs text-muted-foreground">{client.cpf_cnpj || "Sem documento"}</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      {balance > 0 && (
                        <p className="text-xs font-mono text-destructive">
                          Deve {formatCurrency(balance)}
                        </p>
                      )}
                      {limit > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Limite: {formatCurrency(limit)}
                        </p>
                      )}
                      {wouldExceed && (
                        <Badge variant="destructive" className="text-[9px] px-1 py-0 mt-0.5">
                          <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                          Excede limite
                        </Badge>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        ) : (
          /* Selected Client - Mode Selection */
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Client Info */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{selectedClient.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedClient.cpf_cnpj || "Sem documento"}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedClientId(null)}
                className="text-xs text-primary hover:underline"
              >
                Trocar
              </button>
            </div>

            {/* Credit Info */}
            {creditLimit > 0 && (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-lg bg-muted/50">
                  <p className="text-[10px] text-muted-foreground uppercase">Limite</p>
                  <p className="text-sm font-bold font-mono text-foreground">{formatCurrency(creditLimit)}</p>
                </div>
                <div className="p-2 rounded-lg bg-muted/50">
                  <p className="text-[10px] text-muted-foreground uppercase">Usado</p>
                  <p className="text-sm font-bold font-mono text-destructive">{formatCurrency(creditBalance)}</p>
                </div>
                <div className="p-2 rounded-lg bg-muted/50">
                  <p className="text-[10px] text-muted-foreground uppercase">Disponível</p>
                  <p className={`text-sm font-bold font-mono ${exceedsLimit ? "text-destructive" : "text-emerald-500"}`}>
                    {formatCurrency(availableCredit)}
                  </p>
                </div>
              </div>
            )}

            {/* Exceeds limit warning */}
            {exceedsLimit && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20">
                <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
                <p className="text-xs text-destructive">
                  O valor da venda ({formatCurrency(saleTotal)}) excede o crédito disponível ({formatCurrency(availableCredit)}).
                </p>
              </div>
            )}

            {/* Info */}
            <div className="flex items-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/20">
              <ShoppingBag className="w-4 h-4 text-primary flex-shrink-0" />
              <p className="text-xs text-foreground">
                Venda <span className="font-semibold">Fiado</span> — pagamento posterior. Um cupom de controle será gerado com campo para assinatura.
              </p>
            </div>
          </div>
        )}

        {/* Footer */}
        {selectedClient && (
          <div className="p-4 border-t border-border flex gap-2">
            <Button
              variant="outline"
              onClick={() => { reset(); onClose(); }}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={exceedsLimit}
              className="flex-1"
            >
              Confirmar Fiado
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
