import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, CreditCard, Mail, MessageCircle, FlaskConical } from "lucide-react";

export function AdminQuickActions() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(t);
  }, []);

  const actions = [
    { label: "Criar Nova Empresa", icon: Building2, onClick: () => navigate("/empresas") },
    { label: "Criar Novo Plano", icon: CreditCard, onClick: () => navigate("/admin?tab=subscriptions") },
    { label: "Enviar Email Marketing", icon: Mail, onClick: () => navigate("/admin?tab=email") },
    { label: "Abrir Ticket de Suporte", icon: MessageCircle, onClick: () => navigate("/ajuda") },
    { label: "Simular Assinatura", icon: FlaskConical, onClick: () => navigate("/admin?tab=simulation") },
  ];

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        ⚡ Ações Rápidas
      </h3>
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-2">
          {loading
            ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-36 rounded-md" />)
            : actions.map((a) => (
                <Button key={a.label} variant="outline" size="sm" className="gap-2" onClick={a.onClick}>
                  <a.icon className="w-4 h-4" />
                  {a.label}
                </Button>
              ))}
        </CardContent>
      </Card>
    </div>
  );
}
