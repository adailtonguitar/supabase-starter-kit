import { useState } from "react";
import { useDFe, DFeDocument } from "@/hooks/useDFe";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { RefreshCw, Download, Search, FileText, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

export default function ConsultaDFe() {
  const { documents, total, isLoading, error, refetch, distribute, isDistributing } = useDFe();

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const formatCnpj = (cnpj: string) => {
    if (!cnpj || cnpj.length !== 14) return cnpj;
    return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Consulta DFe</h1>
          <p className="text-sm text-muted-foreground">
            NF-e recebidas pela sua empresa (via SEFAZ)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button
            onClick={distribute}
            disabled={isDistributing}
            size="sm"
          >
            <Search className={`w-4 h-4 mr-2 ${isDistributing ? "animate-spin" : ""}`} />
            {isDistributing ? "Consultando..." : "Consultar SEFAZ"}
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm">
                {(error as Error).message || "Erro ao carregar documentos. Verifique se sua empresa tem CNPJ e certificado cadastrados na Nuvem Fiscal."}
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
            {total > 0 && (
              <Badge variant="secondary" className="ml-2">{total}</Badge>
            )}
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
              <p className="text-sm mt-1">
                Clique em "Consultar SEFAZ" para buscar NF-e emitidas contra seu CNPJ.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nº</TableHead>
                    <TableHead>Emitente</TableHead>
                    <TableHead>CNPJ Emitente</TableHead>
                    <TableHead>Data Emissão</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Tipo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc) => (
                    <TableRow key={doc.id || doc.nsu}>
                      <TableCell className="font-mono text-sm">{doc.numero || doc.nsu}</TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {doc.nome_emitente || "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {formatCnpj(doc.cnpj_emitente)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {doc.data_emissao
                          ? format(new Date(doc.data_emissao), "dd/MM/yyyy")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {doc.valor_total ? formatCurrency(doc.valor_total) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            doc.situacao === "autorizada"
                              ? "default"
                              : doc.situacao === "cancelada"
                              ? "destructive"
                              : "secondary"
                          }
                          className="text-xs"
                        >
                          {doc.situacao || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {doc.schema || doc.tipo_documento || "NF-e"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
