import { useState } from "react";
import { usePurchaseEntries } from "@/hooks/usePurchaseEntries";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Package, Pencil, Trash2, Info, FileDown, Filter,
  ChevronDown, Loader2, FileText, CheckCircle2, RotateCcw,
} from "lucide-react";
import ReversalDialog from "@/components/entradas/ReversalDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const PAGE_SIZES = [5, 10, 25, 50];

export default function Entradas() {
  const { entries, isLoading, finalizeEntry, deleteEntry, reverseEntry, isReversing } = usePurchaseEntries();
  const navigate = useNavigate();
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");

  const filtered = entries.filter((e) => {
    const matchSearch =
      !searchTerm ||
      (e.supplier_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.nfe_number || "").includes(searchTerm) ||
      String(e.entry_number || "").includes(searchTerm);
    const matchStatus =
      statusFilter === "todos" || (e.status || "pendente") === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paged = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  const formatCurrency = (v: number | null) =>
    v != null ? `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "R$ 0,00";

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Filtros */}
      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full justify-between">
            <span className="flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Filtros de pesquisa
            </span>
            <ChevronDown className={`w-4 h-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <Card>
            <CardContent className="pt-4 flex flex-col sm:flex-row gap-4">
              <Input
                placeholder="Buscar por fornecedor, Nº NF ou Nº entrada..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(0); }}
                className="flex-1"
              />
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(0); }}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="finalizado">Finalizado</SelectItem>
                  <SelectItem value="estornado">Estornado</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Tabela */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Package className="w-5 h-5 text-primary" />
            Entradas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm text-muted-foreground">Itens por página</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(0); }}>
              <SelectTrigger className="w-[100px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((s) => (
                  <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : paged.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>Nenhuma entrada encontrada</p>
              <p className="text-sm mt-1">Importe uma NF-e para registrar entradas automaticamente</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Opções</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead className="text-center">NºEntrada</TableHead>
                    <TableHead className="text-center">Modelo</TableHead>
                    <TableHead className="text-center">NºNF</TableHead>
                    <TableHead className="text-center">Série</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-center">Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-8 w-8 bg-primary/10 text-primary hover:bg-primary/20"
                            title="Detalhes"
                            onClick={() => navigate(`/importacao-nfe`)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>

                          {(entry.status || "pendente") === "estornado" ? (
                            <Button size="icon" variant="outline" className="h-8 w-8 opacity-40 cursor-not-allowed" disabled title="Entrada estornada">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          ) : (entry.status || "pendente") === "finalizado" ? (
                            <Button size="icon" variant="outline" className="h-8 w-8 opacity-40 cursor-not-allowed" disabled title="Entradas finalizadas não podem ser excluídas">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          ) : (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="icon" variant="outline" className="h-8 w-8 bg-destructive/10 text-destructive hover:bg-destructive/20" title="Excluir">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir entrada?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Esta ação não pode ser desfeita. O registro de importação será removido.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteEntry(entry.id)}>Confirmar</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}

                          {(entry.status || "pendente") === "finalizado" && (
                            <ReversalDialog
                              entryId={entry.id}
                              supplierName={entry.supplier_name}
                              onConfirm={reverseEntry}
                              isLoading={isReversing}
                            />
                          )}

                          <Button
                            size="icon"
                            variant="outline"
                            className="h-8 w-8 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
                            title="Informações"
                          >
                            <Info className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {entry.imported_at
                          ? format(new Date(entry.imported_at), "dd/MM/yyyy", { locale: ptBR })
                          : "—"}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate font-medium">
                        {entry.supplier_name || "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        {entry.entry_number || "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        {entry.nfe_model || "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        {entry.nfe_number || "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        {entry.nfe_series || "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(entry.total_value)}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1">
                          {(entry.status || "pendente") === "estornado" ? (
                            <Badge variant="destructive" className="text-xs">
                              <RotateCcw className="w-3 h-3 mr-1" />
                              Estornado
                            </Badge>
                          ) : (entry.status || "pendente") === "finalizado" ? (
                            <Badge variant="default" className="bg-green-600 hover:bg-green-700 text-xs">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Finalizado
                            </Badge>
                          ) : (
                            <>
                              <span className="text-xs text-muted-foreground">Finalizado?</span>
                              <Badge
                                variant="outline"
                                className="cursor-pointer hover:bg-primary/10 text-xs"
                                onClick={() => finalizeEntry(entry.id)}
                              >
                                Pendente
                              </Badge>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
              <span>
                Mostrando {currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, filtered.length)} de {filtered.length}
              </span>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={currentPage === 0}
                  onClick={() => setCurrentPage((p) => p - 1)}
                >
                  Anterior
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={currentPage >= totalPages - 1}
                  onClick={() => setCurrentPage((p) => p + 1)}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <Button
          className="bg-green-600 hover:bg-green-700 text-white"
          disabled={paged.every((e) => (e.status || "pendente") === "finalizado")}
          onClick={() => {
            paged
              .filter((e) => (e.status || "pendente") === "pendente")
              .forEach((e) => finalizeEntry(e.id));
          }}
        >
          <CheckCircle2 className="w-4 h-4 mr-2" />
          Finalizar Entrada
        </Button>
        <Button variant="outline" onClick={() => navigate("/importacao-nfe")}>
          <FileDown className="w-4 h-4 mr-2" />
          Importar Nota
        </Button>
      </div>
    </div>
  );
}
