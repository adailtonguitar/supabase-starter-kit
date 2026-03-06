import { useState } from "react";
import { useQuotes, type Quote } from "@/hooks/useQuotes";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { FileText, Eye, ShoppingCart, Trash2, CheckCircle, XCircle, Clock, Search, ThumbsUp, Undo2, Package } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { QuoteApprovalDialog } from "@/components/orcamentos/QuoteApprovalDialog";

const statusLabels: Record<string, { label: string; color: string; icon: any }> = {
  pendente: { label: "Pendente", color: "text-warning bg-warning/10 border-warning/20", icon: Clock },
  aprovado: { label: "Aprovado", color: "text-success bg-success/10 border-success/20", icon: CheckCircle },
  convertido: { label: "Convertido", color: "text-primary bg-primary/10 border-primary/20", icon: ShoppingCart },
  cancelado: { label: "Cancelado", color: "text-destructive bg-destructive/10 border-destructive/20", icon: XCircle },
};

export default function Orcamentos() {
  const { quotes, loading, updateQuoteStatus, deleteQuote } = useQuotes();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [viewQuote, setViewQuote] = useState<Quote | null>(null);
  const [approvalQuote, setApprovalQuote] = useState<Quote | null>(null);

  const withNums = quotes.map((q, idx) => ({ ...q, _num: quotes.length - idx }));
  const filtered = withNums.filter((q) =>
    (q.client_name || "").toLowerCase().includes(search.toLowerCase()) ||
    String(q._num).includes(search) ||
    (q.notes || "").toLowerCase().includes(search.toLowerCase())
  );

  const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const handleConvertToSale = (quote: Quote) => {
    sessionStorage.setItem("pdv_load_quote", JSON.stringify({
      quoteId: quote.id,
      items: quote.items_json,
      clientName: quote.client_name,
    }));
    navigate("/pdv");
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            Orçamentos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie seus orçamentos e converta em vendas.</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente, número ou notas..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-muted-foreground">Nenhum orçamento encontrado.</p>
          <p className="text-xs text-muted-foreground mt-1">Crie orçamentos no PDV usando o atalho ou botão "Orçamento".</p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="sm:hidden space-y-2">
            {filtered.map((q) => {
              const st = statusLabels[q.status] || statusLabels.pendente;
              const StatusIcon = st.icon;
              const items = Array.isArray(q.items_json) ? q.items_json : [];
              return (
                <div key={q.id} className="bg-card rounded-xl border border-border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        #{q._num} — {q.client_name || "Sem cliente"}
                      </p>
                      <p className="text-xs text-muted-foreground">{items.length} produto(s)</p>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 ${st.color}`}>
                      <StatusIcon className="w-3 h-3" />
                      {st.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <p className="text-sm font-bold font-mono text-foreground">{fmt(q.total)}</p>
                     <div className="flex items-center gap-1">
                       <button onClick={() => setViewQuote(q)} className="p-1.5 rounded-lg hover:bg-muted" title="Ver">
                         <Eye className="w-4 h-4 text-muted-foreground" />
                       </button>
                       {q.status === "pendente" && (
                         <button onClick={() => setApprovalQuote(q)} className="p-1.5 rounded-lg hover:bg-success/10" title="Aprovar">
                           <ThumbsUp className="w-4 h-4 text-success" />
                         </button>
                       )}
                       {(q.status === "pendente" || q.status === "aprovado") && (
                         <button onClick={() => handleConvertToSale(q)} className="p-1.5 rounded-lg hover:bg-primary/10" title="Converter">
                           <ShoppingCart className="w-4 h-4 text-primary" />
                         </button>
                       )}
                     </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block bg-card rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">#</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Cliente</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Itens</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Total</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Data</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Validade</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((q) => {
                  const st = statusLabels[q.status] || statusLabels.pendente;
                  const StatusIcon = st.icon;
                  const items = Array.isArray(q.items_json) ? q.items_json : [];
                  return (
                    <tr key={q.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-foreground">{q._num}</td>
                      <td className="px-4 py-3 text-foreground">{q.client_name || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{items.length} produto(s)</td>
                      <td className="px-4 py-3 text-right font-bold font-mono text-foreground">{fmt(q.total)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${st.color}`}>
                          <StatusIcon className="w-3 h-3" />
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {new Date(q.created_at).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {q.valid_until ? new Date(q.valid_until + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                           <button onClick={() => setViewQuote(q)} className="p-1.5 rounded-lg hover:bg-muted transition-colors" title="Visualizar">
                             <Eye className="w-4 h-4 text-muted-foreground" />
                           </button>
                           {q.status === "pendente" && (
                             <>
                                <button onClick={() => setApprovalQuote(q)} className="p-1.5 rounded-lg hover:bg-success/10 transition-colors" title="Aprovar">
                                  <ThumbsUp className="w-4 h-4 text-success" />
                                </button>
                               <button onClick={() => handleConvertToSale(q)} className="p-1.5 rounded-lg hover:bg-primary/10 transition-colors" title="Converter em Venda">
                                 <ShoppingCart className="w-4 h-4 text-primary" />
                               </button>
                               <button
                                 onClick={async () => { await updateQuoteStatus(q.id, "cancelado"); toast.info("Orçamento cancelado"); }}
                                 className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors" title="Cancelar"
                               >
                                 <XCircle className="w-4 h-4 text-destructive" />
                               </button>
                             </>
                           )}
                           {q.status === "aprovado" && (
                             <>
                               <button onClick={() => handleConvertToSale(q)} className="p-1.5 rounded-lg hover:bg-primary/10 transition-colors" title="Converter em Venda">
                                 <ShoppingCart className="w-4 h-4 text-primary" />
                               </button>
                               <button
                                 onClick={async () => {
                                   // Release reservation
                                   const reservations = JSON.parse(localStorage.getItem("as_stock_reservations") || "{}");
                                   delete reservations[q.id];
                                   localStorage.setItem("as_stock_reservations", JSON.stringify(reservations));
                                   await updateQuoteStatus(q.id, "cancelado");
                                   toast.info("Orçamento cancelado e estoque liberado");
                                 }}
                                 className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors" title="Cancelar"
                               >
                                 <XCircle className="w-4 h-4 text-destructive" />
                               </button>
                             </>
                           )}
                           {q.status === "cancelado" && (
                             <button
                               onClick={async () => { await deleteQuote(q.id); toast.info("Orçamento excluído"); }}
                               className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors" title="Excluir"
                             >
                               <Trash2 className="w-4 h-4 text-destructive" />
                             </button>
                           )}
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

      {/* View quote detail modal */}
      <AnimatePresence>
        {viewQuote && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setViewQuote(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-lg mx-4 overflow-hidden max-h-[80vh] flex flex-col"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h2 className="text-lg font-bold text-foreground">Orçamento #{(viewQuote as any)._num || ""}</h2>
                <button onClick={() => setViewQuote(null)} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">✕</button>
              </div>
              <div className="p-5 space-y-4 overflow-y-auto">
                {viewQuote.client_name && (
                  <div>
                    <p className="text-xs text-muted-foreground">Cliente</p>
                    <p className="text-sm font-semibold text-foreground">{viewQuote.client_name}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Itens</p>
                  <div className="space-y-1.5">
                    {(Array.isArray(viewQuote.items_json) ? viewQuote.items_json : []).map((item: any, i: number) => (
                      <div key={i} className="flex justify-between items-center px-3 py-2 rounded-lg bg-muted/50 text-sm">
                        <span className="text-foreground">{item.quantity}x {item.name}</span>
                        <span className="font-mono font-bold text-foreground">{fmt(item.unit_price * item.quantity)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {(viewQuote as any).discount_value > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Desconto</span>
                    <span className="text-destructive font-mono">-{fmt((viewQuote as any).discount_value)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold border-t border-border pt-3">
                  <span className="text-foreground">Total</span>
                  <span className="text-primary font-mono">{fmt(viewQuote.total)}</span>
                </div>
                {viewQuote.notes && (
                  <div>
                    <p className="text-xs text-muted-foreground">Observações</p>
                    <p className="text-sm text-foreground">{viewQuote.notes}</p>
                  </div>
                )}
              </div>
              {(viewQuote.status === "pendente" || viewQuote.status === "aprovado") && (
                <div className="px-5 py-4 border-t border-border flex gap-3">
                  {viewQuote.status === "pendente" && (
                    <button
                      onClick={() => { setApprovalQuote(viewQuote); setViewQuote(null); }}
                      className="flex-1 py-2.5 rounded-xl bg-success text-success-foreground text-sm font-bold hover:opacity-90 transition-all flex items-center justify-center gap-2"
                    >
                      <ThumbsUp className="w-4 h-4" />
                      Aprovar
                    </button>
                  )}
                  <button
                    onClick={() => { handleConvertToSale(viewQuote); setViewQuote(null); }}
                    className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-all flex items-center justify-center gap-2"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    Converter em Venda
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Approval Dialog */}
      <AnimatePresence>
        {approvalQuote && (
          <QuoteApprovalDialog
            quote={approvalQuote}
            onClose={() => setApprovalQuote(null)}
            onApproved={() => setApprovalQuote(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
