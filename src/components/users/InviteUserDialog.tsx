import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, UserPlus, Eye, EyeOff, Copy, Check } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type CompanyRole = "admin" | "gerente" | "supervisor" | "caixa";
const roleLabels: Record<CompanyRole, string> = {
  admin: "Administrador",
  gerente: "Gerente",
  supervisor: "Supervisor",
  caixa: "Caixa",
};

export function InviteUserDialog({ open, onOpenChange }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<CompanyRole>("caixa");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [createdUser, setCreatedUser] = useState<{ email: string; password: string } | null>(null);
  const plan = usePlanFeatures();
  const { isSuperAdmin } = useAdminRole();
  const { companyId } = useCompany();

  const generatePassword = () => {
    const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#";
    let pwd = "";
    for (let i = 0; i < 10; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
    setPassword(pwd);
  };

  const copyCredentials = () => {
    if (!createdUser) return;
    navigator.clipboard.writeText(`Email: ${createdUser.email}\nSenha: ${createdUser.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreate = async () => {
    if (!email.trim()) { toast.warning("Informe o email"); return; }
    if (!password.trim() || password.length < 6) { toast.warning("A senha deve ter pelo menos 6 caracteres"); return; }
    if (!companyId) { toast.error("Empresa não identificada"); return; }

    if (!isSuperAdmin) {
      try {
        const result = await plan.checkServerLimit("add_user");
        if (!result.allowed) {
          toast.error(result.reason || "Limite de usuários atingido no seu plano.");
          return;
        }
      } catch { /* Fail open */ }
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada");

      const res = await supabase.functions.invoke("create-company-user", {
        body: {
          email: email.trim(),
          password: password.trim(),
          full_name: name.trim() || email.split("@")[0],
          role,
          company_id: companyId,
        },
      });

      if (res.error) throw new Error(res.error.message);
      const result = res.data;

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Usuário criado com sucesso!");
        setCreatedUser({ email: email.trim(), password: password.trim() });
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar usuário");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      setName("");
      setEmail("");
      setPassword("");
      setRole("caixa");
      setCreatedUser(null);
      setCopied(false);
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Cadastrar Usuário
          </DialogTitle>
        </DialogHeader>

        {createdUser ? (
          <div className="space-y-4">
            <div className="bg-success/10 border border-success/30 rounded-xl p-4 text-center">
              <p className="text-sm font-semibold text-success mb-1">✅ Usuário criado com sucesso!</p>
              <p className="text-xs text-muted-foreground">Envie as credenciais abaixo para o funcionário</p>
            </div>
            <div className="bg-muted/50 rounded-xl p-4 space-y-2 font-mono text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Email:</span>
                <span className="font-semibold text-foreground">{createdUser.email}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Senha:</span>
                <span className="font-semibold text-foreground">{createdUser.password}</span>
              </div>
            </div>
            <Button onClick={copyCredentials} variant="outline" className="w-full">
              {copied ? <><Check className="w-4 h-4 mr-2" />Copiado!</> : <><Copy className="w-4 h-4 mr-2" />Copiar credenciais</>}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              O funcionário deve usar essas credenciais para fazer login. Recomende que ele altere a senha após o primeiro acesso.
            </p>
            <Button onClick={() => handleClose(false)} className="w-full">Fechar</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label>Nome do funcionário</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="João Silva"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="funcionario@email.com"
                type="email"
              />
            </div>
            <div>
              <Label>Senha temporária</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    type={showPassword ? "text" : "password"}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={generatePassword} className="whitespace-nowrap">
                  Gerar
                </Button>
              </div>
            </div>
            <div>
              <Label>Perfil de Acesso</Label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as CompanyRole)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm mt-1"
              >
                {Object.entries(roleLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-muted-foreground">
              {isSuperAdmin
                ? "Super admin: sem limite de usuários."
                : `Seu plano permite até ${plan.maxUsers <= 0 ? "ilimitados" : plan.maxUsers} usuário(s).`}
            </p>
            <Button onClick={handleCreate} className="w-full" disabled={loading}>
              {loading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Criando...</> : "Criar Usuário"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
