import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Brain, Sparkles, AlertTriangle, Trash2, Search, RotateCcw, TrendingUp, Hash, Target } from "lucide-react";
import { getNCMLearningData, clearNCMLearningData } from "@/lib/ncm-learning";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface LearningRow {
  termo: string;
  ncm: string;
  count: number;
}

export function AdminNcmLearning() {
  const [rows, setRows] = useState<LearningRow[]>([]);
  const [search, setSearch] = useState("");

  const load = () => {
    const map = getNCMLearningData();
    const list: LearningRow[] = Object.entries(map).map(([termo, entry]) => ({
      termo,
      ncm: entry.ncm,
      count: entry.count,
    }));
    list.sort((a, b) => b.count - a.count);
    setRows(list);
  };

  useEffect(() => { load(); }, []);

  const totalTermos = rows.length;
  const termosAtivos = rows.filter((r) => r.count >= 3).length;
  const conflitos = (() => {
    const ncmByFirstWord: Record<string, Set<string>> = {};
    rows.forEach((r) => {
      const first = r.termo.split(" ")[0];
      if (!ncmByFirstWord[first]) ncmByFirstWord[first] = new Set();
      ncmByFirstWord[first].add(r.ncm);
    });
    return Object.values(ncmByFirstWord).filter((s) => s.size > 1).length;
  })();
  const precisao = totalTermos > 0 ? Math.round((termosAtivos / totalTermos) * 100) : 0;

  const handleClear = () => {
    clearNCMLearningData();
    setRows([]);
    toast.success("Dados de aprendizado NCM limpos");
  };

  const handleRemove = (termo: string) => {
    try {
      const raw = localStorage.getItem("ncm_learning_data");
      if (!raw) return;
      const map = JSON.parse(raw);
      delete map[termo];
      localStorage.setItem("ncm_learning_data", JSON.stringify(map));
      load();
      toast.success(`Termo "${termo}" removido`);
    } catch {
      toast.error("Erro ao remover");
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) => r.termo.includes(q) || r.ncm.includes(q))
    : rows;

  const getStatus = (count: number) => {
    if (count >= 3) return { label: "Ativo", variant: "default" as const, color: "text-success" };
    if (count >= 2) return { label: "Aprendendo", variant: "secondary" as const, color: "text-warning" };
    return { label: "Novo", variant: "outline" as const, color: "text-muted-foreground" };
  };

  return (
    <div className="space-y-4">
      {/* Cards de métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Hash className="w-5 h-5 text-primary" />
            </div>
            <div>
              <span className="text-xl font-bold font-mono text-foreground">{totalTermos}</span>
              <p className="text-[11px] text-muted-foreground leading-tight">Total Termos</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
              <Target className="w-5 h-5 text-success" />
            </div>
            <div>
              <span className="text-xl font-bold font-mono text-foreground">{precisao}%</span>
              <p className="text-[11px] text-muted-foreground leading-tight">Precisão Estimada</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <div>
              <span className="text-xl font-bold font-mono text-foreground">{termosAtivos}</span>
              <p className="text-[11px] text-muted-foreground leading-tight">Termos Ativos</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <span className="text-xl font-bold font-mono text-foreground">{conflitos}</span>
              <p className="text-[11px] text-muted-foreground leading-tight">Conflitos</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela */}
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
            <span className="text-base sm:text-lg flex items-center gap-2">
              <Brain className="w-5 h-5 text-primary" />
              Inteligência Fiscal IA — NCM
            </span>
            <div className="flex gap-2 flex-wrap">
              <Input
                placeholder="Buscar termo ou NCM..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full sm:w-56 text-sm"
              />
              <Button variant="outline" size="sm" onClick={load} className="gap-1">
                <RotateCcw className="w-3.5 h-3.5" /> Atualizar
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="gap-1" disabled={rows.length === 0}>
                    <Trash2 className="w-3.5 h-3.5" /> Limpar Tudo
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Limpar dados de aprendizado?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Todos os termos e associações NCM aprendidos serão removidos. Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleClear}>Confirmar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhum dado de aprendizado ainda.</p>
              <p className="text-xs mt-1">Cadastre produtos para começar a treinar a IA.</p>
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="space-y-2 sm:hidden">
                {filtered.map((r) => {
                  const status = getStatus(r.count);
                  return (
                    <div key={r.termo} className="border rounded-lg p-3 flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{r.termo}</p>
                        <p className="text-xs text-muted-foreground font-mono">{r.ncm}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant={status.variant} className="text-[10px]">{status.label}</Badge>
                          <span className="text-[10px] text-muted-foreground">{r.count}x</span>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => handleRemove(r.termo)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  );
                })}
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Termo</TableHead>
                      <TableHead>NCM</TableHead>
                      <TableHead className="text-center">Usos</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => {
                      const status = getStatus(r.count);
                      return (
                        <TableRow key={r.termo}>
                          <TableCell className="font-medium">{r.termo}</TableCell>
                          <TableCell className="font-mono text-sm">{r.ncm}</TableCell>
                          <TableCell className="text-center font-mono">{r.count}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant={status.variant}>{status.label}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => handleRemove(r.termo)} className="gap-1 text-destructive hover:text-destructive">
                              <Trash2 className="w-3.5 h-3.5" /> Remover
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
