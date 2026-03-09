import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Download, Loader2, Database, CheckCircle } from "lucide-react";
import { adminQuery } from "@/lib/admin-query";

export function AdminBackup() {
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [selectedCompany, setSelectedCompany] = useState("");
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);

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
    if (!selectedCompany) {
      toast.error("Selecione uma empresa");
      return;
    }

    setExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("export-backup", {
        body: { company_id: selectedCompany },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Download as JSON file
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
      toast.success(`Backup exportado com sucesso! ${totalRows} registros.`);
    } catch (err: any) {
      console.error("Backup error:", err);
      toast.error("Erro ao exportar backup: " + (err.message || "Erro desconhecido"));
    }
    setExporting(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Backup Manual de Dados
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Exporte todos os dados de uma empresa (produtos, vendas, clientes, financeiro, estoque) em um arquivo JSON para backup.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={selectedCompany} onValueChange={setSelectedCompany}>
              <SelectTrigger className="sm:w-[350px]">
                <SelectValue placeholder={loading ? "Carregando empresas..." : "Selecione a empresa"} />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button onClick={handleExport} disabled={exporting || !selectedCompany}>
              {exporting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Exportando...</>
              ) : (
                <><Download className="h-4 w-4 mr-2" /> Exportar Backup</>
              )}
            </Button>
          </div>

          <div className="rounded-lg border p-4 bg-muted/50 space-y-2">
            <h4 className="text-sm font-medium">Tabelas incluídas no backup:</h4>
            <div className="flex flex-wrap gap-2">
              {["products", "sales", "sale_items", "clients", "suppliers", "financial_entries", "stock_movements", "categories", "employees", "cash_sessions"].map(t => (
                <span key={t} className="inline-flex items-center gap-1 text-xs bg-background border rounded px-2 py-1">
                  <CheckCircle className="h-3 w-3 text-green-500" /> {t}
                </span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
