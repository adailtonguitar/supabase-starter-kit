import { useState, useRef } from "react";
import { Upload, FileText, AlertCircle, CheckCircle2, Loader2, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface CSVClientImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ParsedClient {
  name: string;
  cpf_cnpj: string;
  email: string;
  phone: string;
  address_city: string;
  address_state: string;
  address_street: string;
  address_number: string;
  address_neighborhood: string;
  address_zip: string;
  notes: string;
  valid: boolean;
  error?: string;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if ((ch === "," || ch === ";") && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): { clients: ParsedClient[]; errors: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { clients: [], errors: ["Arquivo vazio ou sem dados"] };

  const headerLine = lines[0].toLowerCase()
    .replace(/[áàã]/g, "a").replace(/[éê]/g, "e").replace(/[íî]/g, "i")
    .replace(/[óôõ]/g, "o").replace(/[úû]/g, "u").replace(/ç/g, "c");
  const headers = parseCSVLine(headerLine);

  const nameIdx = headers.findIndex((h) => h.includes("nome") || h.includes("razao"));
  const docIdx = headers.findIndex((h) => h.includes("cpf") || h.includes("cnpj") || h.includes("documento"));
  const emailIdx = headers.findIndex((h) => h.includes("email") || h.includes("e-mail"));
  const phoneIdx = headers.findIndex((h) => h.includes("telefone") || h.includes("celular") || h.includes("fone"));
  const cityIdx = headers.findIndex((h) => h.includes("cidade") || h.includes("municipio"));
  const stateIdx = headers.findIndex((h) => h.includes("estado") || h === "uf");
  const streetIdx = headers.findIndex((h) => h.includes("rua") || h.includes("endereco") || h.includes("logradouro"));
  const numberIdx = headers.findIndex((h) => h.includes("numero") || h === "nro" || h === "num");
  const neighborhoodIdx = headers.findIndex((h) => h.includes("bairro") || h.includes("distrito"));
  const zipIdx = headers.findIndex((h) => h.includes("cep"));
  const notesIdx = headers.findIndex((h) => h.includes("obs") || h.includes("nota"));

  if (nameIdx === -1) return { clients: [], errors: ["Coluna 'nome' não encontrada no cabeçalho"] };

  const clients: ParsedClient[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const name = cols[nameIdx]?.trim();
    if (!name) { errors.push(`Linha ${i + 1}: nome vazio, ignorada`); continue; }

    const col = (idx: number) => idx >= 0 ? cols[idx]?.trim() || "" : "";

    const client: ParsedClient = {
      name,
      cpf_cnpj: col(docIdx).replace(/\D/g, ""),
      email: col(emailIdx),
      phone: col(phoneIdx),
      address_city: col(cityIdx),
      address_state: col(stateIdx),
      address_street: col(streetIdx),
      address_number: col(numberIdx),
      address_neighborhood: col(neighborhoodIdx),
      address_zip: col(zipIdx).replace(/\D/g, ""),
      notes: col(notesIdx),
      valid: true,
    };

    clients.push(client);
  }

  return { clients, errors };
}

export function CSVClientImportDialog({ open, onOpenChange }: CSVClientImportDialogProps) {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
  const [clients, setClients] = useState<ParsedClient[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: number }>({ imported: 0, errors: 0 });

  const reset = () => { setStep("upload"); setClients([]); setParseErrors([]); setResult({ imported: 0, errors: 0 }); };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { clients: parsed, errors } = parseCSV(text);
      setClients(parsed);
      setParseErrors(errors);
      setStep("preview");
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  };

  const handleImport = async () => {
    if (!companyId) return;
    setImporting(true);
    const validClients = clients.filter((c) => c.valid);
    let imported = 0;
    let errors = 0;

    const batchSize = 50;
    for (let i = 0; i < validClients.length; i += batchSize) {
      const batch = validClients.slice(i, i + batchSize).map((c) => ({
        name: c.name,
        cpf_cnpj: c.cpf_cnpj || null,
        email: c.email || null,
        phone: c.phone || null,
        address_city: c.address_city || null,
        address_state: c.address_state || null,
        address_street: c.address_street || null,
        address_number: c.address_number || null,
        address_neighborhood: c.address_neighborhood || null,
        address_zip: c.address_zip || null,
        notes: c.notes || null,
        company_id: companyId,
      }));

      const { data, error } = await supabase.from("clients").insert(batch).select("id");
      if (error) {
        errors += batch.length;
      } else {
        imported += data.length;
      }
    }

    setResult({ imported, errors });
    setStep("done");
    setImporting(false);
    queryClient.invalidateQueries({ queryKey: ["clients"] });
    if (imported > 0) toast.success(`${imported} cliente(s) importado(s)!`);
    if (errors > 0) toast.error(`${errors} cliente(s) com erro`);
  };

  const downloadTemplate = () => {
    const csv = "nome;cpf_cnpj;email;telefone;cidade;uf;rua;numero;bairro;cep;observacoes\nJoão da Silva;12345678900;joao@email.com;11999998888;São Paulo;SP;Rua das Flores;123;Centro;01001000;Cliente VIP";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo_importacao_clientes.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!open) return null;

  const validCount = clients.filter((c) => c.valid).length;
  const invalidCount = clients.filter((c) => !c.valid).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { reset(); onOpenChange(false); }}>
      <div className="bg-card rounded-xl border border-border max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Importar Clientes via CSV</h2>
          <button onClick={() => { reset(); onOpenChange(false); }} className="text-muted-foreground hover:text-foreground text-xl leading-none">&times;</button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {step === "upload" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Faça upload de um arquivo CSV com os dados dos clientes. O sistema detecta automaticamente as colunas pelo cabeçalho.
              </p>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
              >
                <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground">Clique para selecionar o arquivo CSV</p>
                <p className="text-xs text-muted-foreground mt-1">Formatos aceitos: .csv (separado por vírgula ou ponto-e-vírgula)</p>
              </div>
              <input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
              <button onClick={downloadTemplate} className="flex items-center gap-2 text-sm text-primary hover:underline">
                <Download className="w-4 h-4" /> Baixar modelo CSV de exemplo
              </button>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1.5 text-success"><CheckCircle2 className="w-4 h-4" /> {validCount} válido(s)</span>
                {invalidCount > 0 && <span className="flex items-center gap-1.5 text-destructive"><AlertCircle className="w-4 h-4" /> {invalidCount} com erro</span>}
              </div>

              {parseErrors.length > 0 && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 space-y-1">
                  {parseErrors.slice(0, 5).map((err, i) => (
                    <p key={i} className="text-xs text-destructive">{err}</p>
                  ))}
                  {parseErrors.length > 5 && <p className="text-xs text-destructive">...e mais {parseErrors.length - 5} aviso(s)</p>}
                </div>
              )}

              <div className="border border-border rounded-lg overflow-x-auto max-h-64">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-muted-foreground">Status</th>
                      <th className="px-3 py-2 text-left text-muted-foreground">Nome</th>
                      <th className="px-3 py-2 text-left text-muted-foreground">CPF/CNPJ</th>
                      <th className="px-3 py-2 text-left text-muted-foreground">Email</th>
                      <th className="px-3 py-2 text-left text-muted-foreground">Telefone</th>
                      <th className="px-3 py-2 text-left text-muted-foreground">Cidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.slice(0, 50).map((c, i) => (
                      <tr key={i} className={`border-t border-border ${!c.valid ? "bg-destructive/5" : ""}`}>
                        <td className="px-3 py-1.5">{c.valid ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <AlertCircle className="w-3.5 h-3.5 text-destructive" />}</td>
                        <td className="px-3 py-1.5 text-foreground truncate max-w-[180px]">{c.name}</td>
                        <td className="px-3 py-1.5 text-muted-foreground font-mono">{c.cpf_cnpj || "—"}</td>
                        <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[150px]">{c.email || "—"}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{c.phone || "—"}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{c.address_city || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {clients.length > 50 && <p className="text-xs text-muted-foreground text-center py-2">Mostrando 50 de {clients.length} clientes</p>}
              </div>
            </div>
          )}

          {step === "done" && (
            <div className="text-center py-8 space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
              <p className="text-lg font-semibold text-foreground">Importação concluída!</p>
              <p className="text-sm text-muted-foreground">{result.imported} cliente(s) importado(s){result.errors > 0 ? `, ${result.errors} com erro` : ""}.</p>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border flex justify-end gap-3">
          {step === "preview" && (
            <>
              <button onClick={reset} className="px-4 py-2 rounded-lg bg-muted text-muted-foreground text-sm font-medium hover:opacity-90">Voltar</button>
              <button onClick={handleImport} disabled={importing || validCount === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                {importing ? "Importando..." : `Importar ${validCount} cliente(s)`}
              </button>
            </>
          )}
          {step === "done" && (
            <button onClick={() => { reset(); onOpenChange(false); }} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">Fechar</button>
          )}
        </div>
      </div>
    </div>
  );
}