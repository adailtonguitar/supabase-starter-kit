import { useState } from "react";
import { useDFe, DFeDocument } from "@/hooks/useDFe";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { RefreshCw, Download, Search, FileText, AlertTriangle, Package, Loader2, CheckCircle, Eye, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { NFeImportDialog } from "@/components/stock/NFeImportDialog";
import { toast } from "sonner";
import { PlanGate } from "@/components/PlanGate";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function ConsultaDFe() {
  return (
    <PlanGate feature="hasDFe" featureName="Consulta DF-e">
      <ConsultaDFeContent />
    </PlanGate>
  );
}

function ConsultaDFeContent() {
  const { documents, total, isLoading, error, refetch, distribute, isDistributing, downloadXml, manifest } = useDFe();
  const [importOpen, setImportOpen] = useState(false);
  const [importXml, setImportXml] = useState<string | undefined>(undefined);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [manifestingId, setManifestingId] = useState<string | null>(null);

  const handleImportDoc = async (doc: DFeDocument) => {
    const docId = doc.nuvem_fiscal_id || doc.id;
    if (!docId) {
      toast.error("Documento sem ID para download");
      return;
    }
    setDownloadingId(doc.id);
    const xml = await downloadXml(docId);
    setDownloadingId(null);
    if (xml) {
      setImportXml(xml);
      setImportOpen(true);
    }
  };

  const handleManifest = async (doc: DFeDocument, tipo: string) => {
    const docId = doc.nuvem_fiscal_id || doc.id;
    if (!docId) {
      toast.error("Documento sem ID para manifestação");
      return;
    }
    setManifestingId(doc.id);
    await manifest(docId, doc.chave, tipo);
    setManifestingId(null);
  };

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const formatCnpj = (cnpj: string) => {
    if (!cnpj || cnpj.length !== 14) return cnpj;
    return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  };

  const getStatusBadge = (doc: DFeDocument) => {
    const status = doc.status_manifestacao || "pendente";
    const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      pendente: { label: "Pendente", variant: "outline" },
      ciencia: { label: "Ciência", variant: "secondary" },
      confirmado: { label: "Confirmado", variant: "default" },
      desconhecimento: { label: "Desconhecido", variant: "destructive" },
      nao_realizada: { label: "Não realizada", variant: "destructive" },
    };
    const info = map[status] || map.pendente;
    return <Badge variant={info.variant} className="text-xs">{info.label}</Badge>;
  };

  const getSituacaoBadge = (situacao: string) => {
    const map: Record<string, { variant: "default" | "secondary" | "destructive" | "outline" }> = {
      resumo: { variant: "outline" },
      manifesto: { variant: "secondary" },
      completo: { variant: "default" },
      autorizada: { variant: "default" },
      cancelada: { variant: "destructive" },
    };
    const info = map[situacao] || { variant: "outline" as const };
    return <Badge variant={info.variant} className="text-xs capitalize">{situacao || "—"}</Badge>;
  };

  const stats = {
    total: documents.length,
    pendentes: documents.filter(d => !d.status_manifestacao || d.status_manifestacao === "pendente").length,
    manifestados: documents.filter(d => d.status_manifestacao === "ciencia" || d.status_manifestacao === "confirmado").length,
    importados: documents.filter(d => d.importado).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notas da SEFAZ</h1>
          <p className="text-sm text-muted-foreground">
            NF-e recebidas automaticamente via SEFAZ • Atualização automática a cada hora
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button onClick={distribute} disabled={isDistributing} size="sm">
            <Search className={`w-4 h-4 mr-2 ${isDistributing ? "animate-spin" : ""}`} />
            {isDistributing ? "Consultando..." : "Consultar SEFAZ"}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total de notas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{stats.pendentes}</p>
                <p className="text-xs text-muted-foreground">Pendentes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{stats.manifestados}</p>
                <p className="text-xs text-muted-foreground">Manifestados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" />
              <div>
                <p className="text-2xl font-bold">{stats.importados}</p>
                <p className="text-xs text-muted-foreground">Importados</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm">
                {(error as Error).message || "Erro ao carregar documentos."}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Documentos Recebidos
            {total > 0 && <Badge variant="secondary" className="ml-2">{total}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Nenhum documento encontrado</p>
              <p className="text-sm mt-1">Clique em "Consultar SEFAZ" para buscar NF-e emitidas contra seu CNPJ.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nº</TableHead>
                    <TableHead>Emitente</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Manifestação</TableHead>
                    <TableHead className="text-center">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc) => (
                    <TableRow key={doc.id || doc.nsu} className={doc.importado ? "opacity-60" : ""}>
                      <TableCell className="font-mono text-sm">{doc.numero || doc.nsu}</TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate">{doc.nome_emitente || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{formatCnpj(doc.cnpj_emitente)}</TableCell>
                      <TableCell className="text-sm">
                        {doc.data_emissao ? format(new Date(doc.data_emissao), "dd/MM/yyyy") : "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {doc.valor_total ? formatCurrency(doc.valor_total) : "—"}
                      </TableCell>
                      <TableCell>{getSituacaoBadge(doc.situacao)}</TableCell>
                      <TableCell>{getStatusBadge(doc)}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          {/* Manifest dropdown */}
                          {(!doc.status_manifestacao || doc.status_manifestacao === "pendente") && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" disabled={manifestingId === doc.id} className="text-xs">
                                  {manifestingId === doc.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                  )}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                <DropdownMenuItem onClick={() => handleManifest(doc, "ciencia")}>
                                  <Eye className="w-4 h-4 mr-2" /> Ciência da operação
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleManifest(doc, "confirmacao")}>
                                  <CheckCircle className="w-4 h-4 mr-2" /> Confirmação
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleManifest(doc, "desconhecimento")}>
                                  <AlertTriangle className="w-4 h-4 mr-2" /> Desconhecimento
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                          {/* Import button */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleImportDoc(doc)}
                            disabled={downloadingId === doc.id || doc.importado}
                            className="text-xs"
                          >
                            {downloadingId === doc.id ? (
                              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                            ) : (
                              <Package className="w-3.5 h-3.5 mr-1" />
                            )}
                            {doc.importado ? "Importado" : "Importar"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <NFeImportDialog
        open={importOpen}
        onOpenChange={(open) => {
          setImportOpen(open);
          if (!open) setImportXml(undefined);
        }}
        xmlContent={importXml}
      />
    </div>
  );
}
