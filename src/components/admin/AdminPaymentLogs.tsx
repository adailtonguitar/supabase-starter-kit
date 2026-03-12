import { useState, useEffect } from "react";
import { adminQuery } from "@/lib/admin-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { RefreshCw, AlertTriangle, CheckCircle, Clock, XCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface WebhookLog {
  id: string;
  mp_payment_id: string | null;
  event_type: string;
  status: string | null;
  amount: number | null;
  plan_key: string | null;
  user_id: string | null;
  error_message: string | null;
  processed: boolean;
  retry_count: number;
  created_at: string;
}

export function AdminPaymentLogs() {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await adminQuery({
        table: "payment_webhook_logs",
        select: "*",
        order: { column: "created_at", ascending: false },
        limit: 100,
      });
      setLogs(data ?? []);
    } catch (err) {
      console.error("[AdminPaymentLogs] Error:", err);
      setLogs([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, []);

  const filtered = logs.filter(l => {
    if (filter === "failed" && l.processed) return false;
    if (filter === "success" && !l.processed) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        (l.mp_payment_id || "").toLowerCase().includes(q) ||
        (l.event_type || "").toLowerCase().includes(q) ||
        (l.plan_key || "").toLowerCase().includes(q) ||
        (l.user_id || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const failedCount = logs.filter(l => !l.processed && l.error_message).length;
  const successCount = logs.filter(l => l.processed).length;

  const statusIcon = (log: WebhookLog) => {
    if (log.processed) return <CheckCircle className="w-4 h-4 text-emerald-500" />;
    if (log.error_message) return <XCircle className="w-4 h-4 text-destructive" />;
    return <Clock className="w-4 h-4 text-muted-foreground" />;
  };

  const eventBadge = (type: string) => {
    if (type.includes("approved")) return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200">Aprovado</Badge>;
    if (type.includes("pending")) return <Badge variant="secondary">Pendente</Badge>;
    if (type.includes("rejected") || type.includes("failed")) return <Badge variant="destructive">Falhou</Badge>;
    if (type.includes("fetch_error")) return <Badge variant="destructive">Erro API</Badge>;
    if (type.includes("invalid")) return <Badge className="bg-warning/10 text-warning border-warning/30">Inválido</Badge>;
    return <Badge variant="outline">{type}</Badge>;
  };

  return (
    <Card>
      <CardHeader className="p-3 sm:p-6">
        <CardTitle className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="text-base sm:text-lg">Logs de Pagamento ({filtered.length})</span>
            {failedCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="w-3 h-3" /> {failedCount} falha{failedCount !== 1 ? "s" : ""}
              </Badge>
            )}
            <Badge variant="secondary" className="gap-1">
              <CheckCircle className="w-3 h-3" /> {successCount} processado{successCount !== 1 ? "s" : ""}
            </Badge>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-32 h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="success">Processados</SelectItem>
                <SelectItem value="failed">Com erro</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Buscar ID, plano..." value={search} onChange={e => setSearch(e.target.value)} className="w-full sm:w-48 text-sm" />
            <Button variant="outline" size="sm" onClick={fetchLogs}><RefreshCw className="h-4 w-4" /></Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-6 pt-0">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-8">Nenhum log encontrado.</p>
        ) : (
          <>
            {/* Mobile */}
            <div className="space-y-3 sm:hidden">
              {filtered.map(log => (
                <div key={log.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    {statusIcon(log)}
                    <span className="font-mono text-xs truncate flex-1">{log.mp_payment_id || "—"}</span>
                    {eventBadge(log.event_type)}
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                    <span>Plano: <strong className="text-foreground">{log.plan_key?.toUpperCase() || "—"}</strong></span>
                    <span>Valor: <strong className="text-foreground">{log.amount ? `R$ ${log.amount.toFixed(2)}` : "—"}</strong></span>
                    <span className="col-span-2">{format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                  </div>
                  {log.error_message && (
                    <p className="text-xs text-destructive bg-destructive/5 rounded p-2 break-all">{log.error_message}</p>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop */}
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead>MP Payment ID</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Erro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(log => (
                    <TableRow key={log.id}>
                      <TableCell>{statusIcon(log)}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {format(new Date(log.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell>{eventBadge(log.event_type)}</TableCell>
                      <TableCell className="font-mono text-xs">{log.mp_payment_id || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.plan_key?.toUpperCase() || "—"}</Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {log.amount ? `R$ ${log.amount.toFixed(2)}` : "—"}
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        {log.error_message ? (
                          <span className="text-xs text-destructive truncate block" title={log.error_message}>
                            {log.error_message.slice(0, 80)}{log.error_message.length > 80 ? "..." : ""}
                          </span>
                        ) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
