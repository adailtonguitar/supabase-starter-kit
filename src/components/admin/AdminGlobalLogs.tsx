import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, FileText, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface LogEntry {
  id: string;
  company_id: string;
  user_id: string | null;
  action: string;
  details: any;
  created_at: string;
  company_name?: string;
}

export function AdminGlobalLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState<string[]>([]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const filters: any[] = [];
      if (actionFilter && actionFilter !== "all") {
        filters.push({ op: "eq", column: "action", value: actionFilter });
      }

      const { data: logsRes, error: logsErr } = await supabase.functions.invoke("admin-query", {
        body: {
          table: "action_logs",
          select: "id, company_id, user_id, action, details, created_at",
          filters,
          order: { column: "created_at", ascending: false },
          limit: 300,
        },
      });

      if (logsErr) throw logsErr;
      const data = logsRes?.data ?? [];

      if (data.length === 0) {
        setLogs([]);
        setLoading(false);
        return;
      }

      const companyIds = [...new Set(data.map((l: any) => l.company_id).filter(Boolean))];
      const { data: companiesRes } = await supabase.functions.invoke("admin-query", {
        body: {
          table: "companies",
          select: "id, name",
          filters: [{ op: "in", column: "id", value: companyIds }],
          limit: 500,
        },
      });

      const companyMap: Record<string, string> = {};
      (companiesRes?.data ?? []).forEach((c: any) => { companyMap[c.id] = c.name; });

      const enriched = data.map((l: any) => ({
        ...l,
        company_name: companyMap[l.company_id] || l.company_id?.slice(0, 8) || "—",
      }));

      const uniqueActions = [...new Set(data.map((l: any) => l.action))].sort();
      setActions(uniqueActions as string[]);

      setLogs(enriched);
    } catch (err) {
      console.error("[AdminGlobalLogs] Error:", err);
      setLogs([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, [actionFilter]);

  const filtered = search.trim()
    ? logs.filter((l) =>
        l.company_name?.toLowerCase().includes(search.toLowerCase()) ||
        l.action?.toLowerCase().includes(search.toLowerCase()) ||
        l.user_id?.toLowerCase().includes(search.toLowerCase())
      )
    : logs;

  const formatDetails = (details: any) => {
    if (!details) return "—";
    if (typeof details === "string") return details;
    const str = JSON.stringify(details);
    return str.length > 80 ? str.slice(0, 80) + "…" : str;
  };

  return (
    <Card>
      <CardHeader className="p-3 sm:p-6">
        <CardTitle className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
          <span className="text-base sm:text-lg flex items-center gap-2">
            <FileText className="w-4 h-4" /> Logs ({filtered.length})
          </span>
          <div className="flex gap-2 flex-wrap">
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-40 text-xs h-9">
                <Filter className="w-3 h-3 mr-1" />
                <SelectValue placeholder="Filtrar ação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as ações</SelectItem>
                {actions.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-48 text-sm h-9"
            />
            <Button variant="outline" size="sm" onClick={fetchLogs}>
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhum log encontrado.</p>
        ) : (
          <>
            {/* Mobile */}
            <div className="space-y-3 sm:hidden">
              {filtered.map((l) => (
                <div key={l.id} className="border rounded-lg p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">{l.action}</Badge>
                    <span className="text-[10px] text-muted-foreground ml-2 shrink-0">
                      {new Date(l.created_at).toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{l.company_name}</p>
                  <p className="text-[11px] text-muted-foreground font-mono truncate">{formatDetails(l.details)}</p>
                </div>
              ))}
            </div>

            {/* Desktop */}
            <div className="hidden sm:block max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(l.created_at).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{l.company_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{l.action}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate font-mono">
                        {formatDetails(l.details)}
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
