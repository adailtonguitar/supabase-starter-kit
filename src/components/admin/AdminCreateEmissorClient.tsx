import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { FilePlus2, Loader2, CheckCircle2, Copy, Eye, EyeOff } from "lucide-react";
import { logAction } from "@/services/ActionLogger";
import { useAuth } from "@/hooks/useAuth";

export function AdminCreateEmissorClient() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ email: string; password: string; companyName: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const [form, setForm] = useState({
    company_name: "",
    cnpj: "",
    email: "",
    password: "",
    full_name: "",
  });

  const resetForm = () => {
    setForm({ company_name: "", cnpj: "", email: "", password: "", full_name: "" });
    setResult(null);
  };

  const handleSubmit = async () => {
    if (!form.company_name.trim() || !form.email.trim() || !form.password) {
      toast.error("Preencha nome da empresa, e-mail e senha");
      return;
    }
    if (form.password.length < 6) {
      toast.error("Senha deve ter pelo menos 6 caracteres");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-emissor-client", {
        body: form,
      });

      if (error) {
        const msg = typeof error === "object" && "message" in error ? error.message : "Erro ao criar cliente";
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);

      setResult({ email: form.email, password: form.password, companyName: form.company_name });
      toast.success("Cliente emissor criado com sucesso!");
      logAction({ companyId: "system", userId: user?.id, action: "Cliente emissor criado via admin", module: "admin", details: `Empresa: ${form.company_name}, Email: ${form.email}` });
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar cliente emissor");
    } finally {
      setLoading(false);
    }
  };

  const copyCredentials = () => {
    if (!result) return;
    const text = `Empresa: ${result.companyName}\nE-mail: ${result.email}\nSenha: ${result.password}\nAcesso: ${window.location.origin}/auth`;
    navigator.clipboard.writeText(text);
    toast.success("Credenciais copiadas!");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <FilePlus2 className="h-4 w-4" /> Novo Cliente Emissor
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FilePlus2 className="h-5 w-5 text-primary" />
            Criar Cliente Emissor NF-e
          </DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-semibold">Cliente criado com sucesso!</span>
            </div>
            <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
              <p><strong>Empresa:</strong> {result.companyName}</p>
              <p><strong>E-mail:</strong> {result.email}</p>
              <p><strong>Senha:</strong> {result.password}</p>
              <p><strong>Acesso:</strong> {window.location.origin}/auth</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={copyCredentials} className="gap-1.5">
                <Copy className="h-4 w-4" /> Copiar Credenciais
              </Button>
              <Button size="sm" onClick={() => { resetForm(); }}>
                Criar Outro
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome da Empresa *</Label>
              <Input
                value={form.company_name}
                onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                placeholder="Ex: Loja do João"
              />
            </div>
            <div className="space-y-2">
              <Label>CNPJ (opcional)</Label>
              <Input
                value={form.cnpj}
                onChange={(e) => setForm((f) => ({ ...f, cnpj: e.target.value }))}
                placeholder="00.000.000/0000-00"
              />
            </div>
            <div className="space-y-2">
              <Label>Nome do Responsável</Label>
              <Input
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                placeholder="João Silva"
              />
            </div>
            <div className="space-y-2">
              <Label>E-mail de Acesso *</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="cliente@email.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Senha *</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Mínimo 6 caracteres"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <Button onClick={handleSubmit} disabled={loading} className="w-full gap-1.5">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
              {loading ? "Criando..." : "Criar Cliente Emissor"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
