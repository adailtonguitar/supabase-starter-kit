import { useState } from "react";
import { motion } from "framer-motion";
import { Gift, Star, Trophy, Settings2, TrendingUp, Users, ArrowUpRight, ArrowDownRight, Award, History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLoyalty, type LoyaltyTransaction } from "@/hooks/useLoyalty";
import { Loader2 } from "lucide-react";

function ConfigTab() {
  const { config, saveConfig, configLoading } = useLoyalty();
  const [form, setForm] = useState({
    is_active: config?.is_active ?? true,
    points_per_real: config?.points_per_real ?? 1,
    redemption_value: config?.redemption_value ?? 0.01,
    min_redemption_points: config?.min_redemption_points ?? 100,
    welcome_bonus: config?.welcome_bonus ?? 0,
    birthday_multiplier: config?.birthday_multiplier ?? 2,
  });

  useState(() => {
    if (config) {
      setForm({
        is_active: config.is_active,
        points_per_real: config.points_per_real,
        redemption_value: config.redemption_value,
        min_redemption_points: config.min_redemption_points,
        welcome_bonus: config.welcome_bonus,
        birthday_multiplier: config.birthday_multiplier,
      });
    }
  });

  const handleSave = () => { saveConfig(form); };
  if (configLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Settings2 className="w-4 h-4 text-primary" />Configuração do Programa</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div><p className="text-sm font-medium">Programa Ativo</p><p className="text-xs text-muted-foreground">Habilitar acúmulo e resgate de pontos</p></div>
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
          </div>
          <div className="space-y-2"><label className="text-sm font-medium">Pontos por R$ gasto</label><Input type="number" value={form.points_per_real} onChange={(e) => setForm({ ...form, points_per_real: Number(e.target.value) })} min={0} step={0.1} /><p className="text-xs text-muted-foreground">Ex: 1 = cada R$1 gasto = 1 ponto</p></div>
          <div className="space-y-2"><label className="text-sm font-medium">Valor do ponto no resgate (R$)</label><Input type="number" value={form.redemption_value} onChange={(e) => setForm({ ...form, redemption_value: Number(e.target.value) })} min={0} step={0.01} /><p className="text-xs text-muted-foreground">Ex: 0.01 = 100 pontos = R$1,00 de desconto</p></div>
          <div className="space-y-2"><label className="text-sm font-medium">Mínimo para resgate (pontos)</label><Input type="number" value={form.min_redemption_points} onChange={(e) => setForm({ ...form, min_redemption_points: Number(e.target.value) })} min={1} /></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Gift className="w-4 h-4 text-primary" />Bônus e Multiplicadores</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><label className="text-sm font-medium">Bônus de boas-vindas (pontos)</label><Input type="number" value={form.welcome_bonus} onChange={(e) => setForm({ ...form, welcome_bonus: Number(e.target.value) })} min={0} /><p className="text-xs text-muted-foreground">Pontos ganhos ao fazer a primeira compra</p></div>
          <div className="space-y-2"><label className="text-sm font-medium">Multiplicador de aniversário</label><Input type="number" value={form.birthday_multiplier} onChange={(e) => setForm({ ...form, birthday_multiplier: Number(e.target.value) })} min={1} step={0.5} /><p className="text-xs text-muted-foreground">Pontos multiplicados no mês de aniversário</p></div>
          <div className="p-4 rounded-lg bg-primary/5 border border-primary/10 space-y-1">
            <p className="text-sm font-semibold text-primary">Simulação</p>
            <p className="text-xs text-muted-foreground">Compra de R$ 100,00 = <strong>{Math.floor(100 * form.points_per_real)} pontos</strong></p>
            <p className="text-xs text-muted-foreground">{form.min_redemption_points} pontos = <strong>R$ {(form.min_redemption_points * form.redemption_value).toFixed(2)} de desconto</strong></p>
          </div>
          <Button onClick={handleSave} className="w-full">Salvar Configuração</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function RankingTab() {
  const { topClients, clientsLoading, config } = useLoyalty();
  if (clientsLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  const getTier = (points: number) => {
    if (points >= 5000) return { name: "Ouro", color: "bg-warning/10 text-warning border-warning/20", icon: "🥇" };
    if (points >= 2000) return { name: "Prata", color: "bg-muted text-muted-foreground border-border", icon: "🥈" };
    if (points >= 500) return { name: "Bronze", color: "bg-accent text-accent-foreground border-border", icon: "🥉" };
    return { name: "Iniciante", color: "bg-muted text-muted-foreground border-border", icon: "⭐" };
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6 text-center"><Users className="w-8 h-8 text-primary mx-auto mb-2" /><p className="text-2xl font-bold">{topClients.length}</p><p className="text-xs text-muted-foreground">Clientes com pontos</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><Star className="w-8 h-8 text-warning mx-auto mb-2" /><p className="text-2xl font-bold">{topClients.reduce((s: number, c: any) => s + c.loyalty_points, 0).toLocaleString("pt-BR")}</p><p className="text-xs text-muted-foreground">Total de pontos ativos</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><TrendingUp className="w-8 h-8 text-success mx-auto mb-2" /><p className="text-2xl font-bold">R$ {(topClients.reduce((s: number, c: any) => s + c.loyalty_points, 0) * (config?.redemption_value || 0.01)).toFixed(2)}</p><p className="text-xs text-muted-foreground">Valor em pontos (potencial)</p></CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Trophy className="w-4 h-4 text-primary" />Ranking de Clientes</CardTitle></CardHeader>
        <CardContent>
          {topClients.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum cliente com pontos ainda.</p>
          ) : (
            <div className="space-y-2">
              {topClients.map((client: any, i: number) => {
                const tier = getTier(client.loyalty_points);
                return (
                  <motion.div key={client.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                    <span className="text-lg font-bold text-muted-foreground w-8 text-center">{i + 1}º</span>
                    <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{client.name}</p><p className="text-xs text-muted-foreground">{client.phone || client.cpf_cnpj || "—"}</p></div>
                    <Badge variant="outline" className={tier.color}>{tier.icon} {tier.name}</Badge>
                    <div className="text-right"><p className="text-sm font-bold text-primary">{client.loyalty_points.toLocaleString("pt-BR")}</p><p className="text-[10px] text-muted-foreground">pontos</p></div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TransactionsTab() {
  const { recentTransactions, transactionsLoading, topClients } = useLoyalty();
  if (transactionsLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  const clientMap = new Map(topClients.map((c: any) => [c.id, c.name]));
  const typeConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    earn: { label: "Acúmulo", color: "text-success", icon: ArrowUpRight },
    redeem: { label: "Resgate", color: "text-destructive", icon: ArrowDownRight },
    bonus: { label: "Bônus", color: "text-primary", icon: Award },
    expire: { label: "Expirado", color: "text-muted-foreground", icon: History },
    adjust: { label: "Ajuste", color: "text-warning", icon: Settings2 },
  };
  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><History className="w-4 h-4 text-primary" />Transações Recentes</CardTitle></CardHeader>
      <CardContent>
        {recentTransactions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhuma transação de fidelidade registrada.</p>
        ) : (
          <div className="space-y-2">
            {recentTransactions.map((tx: any) => {
              const cfg = typeConfig[tx.type] || typeConfig.adjust;
              const Icon = cfg.icon;
              return (
                <div key={tx.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-muted ${cfg.color}`}><Icon className="w-4 h-4" /></div>
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium">{clientMap.get(tx.client_id) || "Cliente"}</p><p className="text-xs text-muted-foreground truncate">{tx.description}</p></div>
                  <Badge variant="outline" className={cfg.color}>{cfg.label}</Badge>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${tx.points > 0 ? "text-success" : "text-destructive"}`}>{tx.points > 0 ? "+" : ""}{tx.points}</p>
                    <p className="text-[10px] text-muted-foreground">Saldo: {tx.balance_after}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{new Date(tx.created_at).toLocaleDateString("pt-BR")}</span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Fidelidade() {
  const { config, isActive } = useLoyalty();
  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Gift className="w-6 h-6 text-primary" />Programa de Fidelidade</h1>
          <p className="text-sm text-muted-foreground mt-1">Fidelize seus clientes com sistema de pontos e recompensas</p>
        </div>
        <Badge variant={isActive ? "default" : "secondary"} className="text-xs">{isActive ? "✅ Ativo" : "⏸️ Inativo"}</Badge>
      </div>
      <Tabs defaultValue="ranking" className="space-y-4">
        <TabsList>
          <TabsTrigger value="ranking" className="flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5" /> Ranking</TabsTrigger>
          <TabsTrigger value="transactions" className="flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> Transações</TabsTrigger>
          <TabsTrigger value="config" className="flex items-center gap-1.5"><Settings2 className="w-3.5 h-3.5" /> Configuração</TabsTrigger>
        </TabsList>
        <TabsContent value="ranking"><RankingTab /></TabsContent>
        <TabsContent value="transactions"><TransactionsTab /></TabsContent>
        <TabsContent value="config"><ConfigTab /></TabsContent>
      </Tabs>
    </div>
  );
}
