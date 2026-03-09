import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Download, Upload, Loader2, Database, CheckCircle, AlertTriangle, FileJson } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { adminQuery } from "@/lib/admin-query";

const BACKUP_TABLES = ["products", "sales", "sale_items", "clients", "suppliers", "financial_entries", "stock_movements", "employees", "cash_sessions"];

export function AdminBackup() {
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [selectedCompany, setSelectedCompany] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);

  // Import state
  const [backupFile, setBackupFile] = useState<any>(null);
  const [backupMeta, setBackupMeta] = useState<{ company_name: string; exported_at: string; tables: { table: string; rows: number }[] } | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = async () => {
      const data = await adminQuery<{ id: string; name: string }>({
        table: "companies",
        select: "id, name",
        order: { column: "name", ascending: true },
        limit: 500,
      });
      setCompanies(data);
      setLoading(false);
    };
    load();
  }, []);

  const handleExport = async () => {
    if (!selectedCompany) { toast.error("Selecione uma empresa"); return; }
    setExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("export-backup", {
        body: { company_id: selectedCompany },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const companyName = companies.find(c => c.id === selectedCompany)?.name || "empresa";
      const date = new Date().toISOString().split("T")[0];
      a.download = `backup-${companyName.replace(/\s+/g, "-").toLowerCase()}-${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const totalRows = data?.metadata?.tables?.reduce((sum: number, t: any) => sum + t.rows, 0) || 0;
      toast.success(`Backup exportado! ${totalRows} registros.`);
    } catch (err: any) {
      toast.error("Erro ao exportar: " + (err.message || "Erro desconhecido"));
    }
    setExporting(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        if (!json?.metadata || !json?.data) {
          toast.error("Arquivo JSON inválido — não é um backup do sistema");
          return;
        }
        setBackupFile(json);
        setBackupMeta(json.metadata);
        setImportResult(null);
        toast.success("Arquivo de backup carregado!");
      } catch {
        toast.error("Erro ao ler o arquivo JSON");
      }
    };
    reader.readAsText(file);
  };

  const handleStartImport = () => {
    if (!selectedCompany) { toast.error("Selecione a empresa destino"); return; }
    if (!backupFile) { toast.error("Carregue um arquivo de backup primeiro"); return; }
    setConfirmName("");
    setShowConfirmDialog(true);
  };

  const handleConfirmImport = async () => {
    const targetCompany = companies.find(c => c.id === selectedCompany);
    if (!targetCompany) return;

    if (confirmName.toLowerCase().trim() !== targetCompany.name.toLowerCase().trim()) {
      toast.error("O nome da empresa não confere. Digite exatamente: " + targetCompany.name);
      return;
    }

    setShowConfirmDialog(false);
    setImporting(true);

    try {
      const { data, error } = await supabase.functions.invoke("import-backup", {
        body: {
          company_id: selectedCompany,
          backup_data: backupFile.data,
          confirm_company_name: confirmName,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setImportResult(data);
      toast.success("Backup restaurado com sucesso!");
    } catch (err: any) {
      toast.error("Erro na restauração: " + (err.message || "Erro desconhecido"));
    }
    setImporting(false);
  };

  const totalBackupRows = backupMeta?.tables?.reduce((sum, t) => sum + t.rows, 0) || 0;
  const filteredCompanies = companies.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-4">
      {/* EXPORT */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Exportar Backup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Exporte todos os dados de uma empresa em JSON para backup.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={selectedCompany} onValueChange={setSelectedCompany}>
              <SelectTrigger className="sm:w-[350px]">
                <SelectValue placeholder={loading ? "Carregando..." : "Selecione a empresa"} />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleExport} disabled={exporting || !selectedCompany}>
              {exporting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Exportando...</> : <><Download className="h-4 w-4 mr-2" /> Exportar</>}
            </Button>
          </div>
          <div className="rounded-lg border p-3 bg-muted/50">
            <h4 className="text-xs font-medium mb-2">Tabelas incluídas:</h4>
            <div className="flex flex-wrap gap-1.5">
              {BACKUP_TABLES.map(t => (
                <span key={t} className="inline-flex items-center gap-1 text-xs bg-background border rounded px-2 py-0.5">
                  <CheckCircle className="h-3 w-3 text-primary" /> {t}
                </span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* IMPORT */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Upload className="h-5 w-5" />
            Restaurar Backup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-destructive">Operação destrutiva!</p>
                <p className="text-muted-foreground">
                  Esta ação <strong>apaga todos os dados atuais</strong> da empresa selecionada e substitui pelos dados do backup. Use apenas quando os dados da empresa estiverem corrompidos ou perdidos.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block">1. Selecione a empresa destino (acima)</label>
              {selectedCompany && (
                <p className="text-sm text-muted-foreground">
                  Empresa: <strong>{companies.find(c => c.id === selectedCompany)?.name}</strong>
                </p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">2. Carregue o arquivo de backup (.json)</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <FileJson className="h-4 w-4 mr-2" /> Selecionar arquivo JSON
              </Button>
            </div>

            {backupMeta && (
              <div className="rounded-lg border p-4 bg-muted/50 space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Database className="h-4 w-4" /> Resumo do backup
                </h4>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>Empresa original: <strong>{backupMeta.company_name}</strong></p>
                  <p>Data do backup: <strong>{new Date(backupMeta.exported_at).toLocaleString("pt-BR")}</strong></p>
                  <p>Total de registros: <strong>{totalBackupRows}</strong></p>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {backupMeta.tables?.map(t => (
                    <span key={t.table} className="text-xs bg-background border rounded px-2 py-0.5">
                      {t.table}: <strong>{t.rows}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <Button
              variant="destructive"
              onClick={handleStartImport}
              disabled={importing || !selectedCompany || !backupFile}
            >
              {importing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Restaurando...</> : <><Upload className="h-4 w-4 mr-2" /> Restaurar Backup</>}
            </Button>
          </div>

          {importResult && (
            <div className="rounded-lg border p-4 bg-muted/50 space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-primary" /> Resultado da restauração
              </h4>
              <p className="text-xs text-muted-foreground">
                Restaurado em: {new Date(importResult.restored_at).toLocaleString("pt-BR")}
              </p>
              <div className="space-y-1">
                {importResult.results?.map((r: any) => (
                  <div key={r.table} className="flex items-center gap-2 text-xs">
                    {r.error ? (
                      <AlertTriangle className="h-3 w-3 text-destructive" />
                    ) : (
                      <CheckCircle className="h-3 w-3 text-primary" />
                    )}
                    <span className="font-mono">{r.table}</span>
                    <span className="text-muted-foreground">
                      removidos: {r.deleted} | inseridos: {r.inserted}
                      {r.error && <span className="text-destructive ml-1">({r.error})</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Confirmar restauração
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Esta ação vai <strong>APAGAR TODOS os dados atuais</strong> da empresa
                <strong> {companies.find(c => c.id === selectedCompany)?.name}</strong> e
                substituir pelos {totalBackupRows} registros do backup.
              </p>
              <p>
                Para confirmar, digite o nome exato da empresa abaixo:
              </p>
              <Input
                placeholder={companies.find(c => c.id === selectedCompany)?.name || "Nome da empresa"}
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmImport}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={confirmName.toLowerCase().trim() !== (companies.find(c => c.id === selectedCompany)?.name || "").toLowerCase().trim()}
            >
              Restaurar Backup
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
