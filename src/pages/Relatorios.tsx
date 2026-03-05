import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  BarChart3, Brain, LineChart, TrendingUp, PieChart, FileSpreadsheet,
  GitGraph, Percent, Scale, Bell, Stethoscope, Wallet, ClipboardList,
  Scan, BarChart, AlertTriangle, ShoppingCart, Package,
} from "lucide-react";

type ReportCard = { icon: any; label: string; desc: string; path: string };

const categories: { title: string; color: string; cards: ReportCard[] }[] = [
  {
    title: "Vendas",
    color: "text-primary",
    cards: [
      { icon: BarChart3, label: "Relatório de Vendas", desc: "Vendas por período, produto e forma de pagamento", path: "/relatorio-vendas" },
      { icon: LineChart, label: "Lucro Diário", desc: "Lucro bruto e líquido dia a dia", path: "/lucro-diario" },
      { icon: TrendingUp, label: "Painel de Lucro", desc: "Visão completa de margens e rentabilidade", path: "/painel-lucro" },
      { icon: Percent, label: "Comissões", desc: "Comissões de vendedores e funcionários", path: "/comissoes" },
      { icon: PieChart, label: "Painel do Dono", desc: "Resumo executivo do negócio", path: "/painel-dono" },
    ],
  },
  {
    title: "Financeiro",
    color: "text-emerald-500",
    cards: [
      { icon: FileSpreadsheet, label: "DRE", desc: "Demonstrativo de resultado do exercício", path: "/dre" },
      { icon: GitGraph, label: "Fluxo de Caixa Projetado", desc: "Previsão de entradas e saídas futuras", path: "/fluxo-caixa" },
      { icon: Scale, label: "Conciliação Bancária", desc: "Compare extratos com lançamentos internos", path: "/conciliacao" },
      { icon: Bell, label: "Alertas Financeiros", desc: "Contas a pagar/receber com atraso", path: "/alertas" },
      { icon: Stethoscope, label: "Diagnóstico Financeiro IA", desc: "Análise inteligente da saúde financeira", path: "/diagnostico-financeiro" },
    ],
  },
  {
    title: "Estoque",
    color: "text-blue-500",
    cards: [
      { icon: BarChart, label: "Curva ABC", desc: "Classificação de produtos por importância", path: "/estoque/curva-abc" },
      { icon: AlertTriangle, label: "Ruptura", desc: "Produtos em falta ou abaixo do mínimo", path: "/estoque/ruptura" },
      { icon: ShoppingCart, label: "Sugestão de Compra IA", desc: "IA sugere reposição inteligente", path: "/sugestao-compra" },
      { icon: ClipboardList, label: "Inventário", desc: "Contagem e conferência de estoque", path: "/estoque/inventario" },
      { icon: Package, label: "Perdas", desc: "Registro e análise de perdas e avarias", path: "/estoque/perdas" },
    ],
  },
  {
    title: "Auditoria",
    color: "text-orange-500",
    cards: [
      { icon: Wallet, label: "Sessões de Caixa", desc: "Histórico de abertura/fechamento de caixa", path: "/caixa" },
      { icon: Scan, label: "Auditoria Fiscal", desc: "Logs de operações fiscais", path: "/fiscal/auditoria" },
      { icon: Brain, label: "Relatórios IA", desc: "Análises geradas por inteligência artificial", path: "/relatorios-ia" },
    ],
  },
];

export default function Relatorios() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
        <p className="text-muted-foreground mt-1">Todos os relatórios do sistema organizados por categoria.</p>
      </div>

      {categories.map((cat, ci) => (
        <motion.div
          key={cat.title}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: ci * 0.08 }}
        >
          <h2 className={`text-lg font-bold mb-3 ${cat.color}`}>{cat.title}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {cat.cards.map((card) => (
              <Link
                key={card.path}
                to={card.path}
                className="group flex items-start gap-3 p-4 rounded-xl border border-border bg-card hover:border-primary/30 hover:shadow-md hover:shadow-primary/5 transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/15 transition-colors">
                  <card.icon className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm">{card.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{card.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
