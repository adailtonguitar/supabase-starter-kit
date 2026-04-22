import { motion } from "framer-motion";
import {
  Monitor,
  BarChart3,
  Package,
  FileText,
  WifiOff,
  Shield,
  Scale,
  CalendarClock,
  Users,
  Tag,
  Brain,
  CreditCard,
  Camera,
  ScanBarcode,
} from "lucide-react";
import pdvScreenReal from "@/assets/pdv-venda-real.webp";
import stockEmployee from "@/assets/stock-employee.webp";

const features = [
  {
    icon: Monitor,
    title: "PDV Completo",
    desc: "Caixa rápido com atalhos, leitor de código de barras, pesagem e múltiplas formas de pagamento.",
    color: "bg-primary/10 text-primary",
  },
  {
    icon: FileText,
    title: "Emissão Fiscal",
    desc: "NFC-e e NF-e automáticas integradas à SEFAZ com contingência offline e DANFE.",
    color: "bg-info/10 text-info",
  },
  {
    icon: Package,
    title: "Estoque Inteligente",
    desc: "Lotes, validade, alertas, importação por NF-e e CSV. Controle total do seu inventário.",
    color: "bg-amber/10 text-amber",
  },
  {
    icon: ScanBarcode,
    title: "Cadastro por Código de Barras",
    desc: "Escaneie o código de barras com leitor ou câmera do celular e o sistema preenche nome, categoria e unidade automaticamente.",
    color: "bg-lime/10 text-lime",
  },
  {
    icon: Scale,
    title: "Balança Integrada",
    desc: "Leitura de etiquetas de peso e preço por kg/g com cálculo automático na venda.",
    color: "bg-violet/10 text-violet",
  },
  {
    icon: BarChart3,
    title: "Financeiro Completo",
    desc: "Contas a pagar/receber, fluxo de caixa, DRE, fechamento diário e lucratividade.",
    color: "bg-success/10 text-success",
  },
  {
    icon: WifiOff,
    title: "Funciona Sem Internet",
    desc: "Continue vendendo mesmo quando a internet cair. O sistema opera offline e sincroniza tudo automaticamente ao reconectar.",
    color: "bg-orange/10 text-orange",
  },
  {
    icon: CalendarClock,
    title: "Controle de Validade",
    desc: "Alertas de vencimento, registro de perdas e quebras. Zero desperdício.",
    color: "bg-rose/10 text-rose",
  },
  {
    icon: Users,
    title: "Multi-caixa",
    desc: "Vários terminais, perfis de acesso e trilha de auditoria completa.",
    color: "bg-cyan/10 text-cyan",
  },
  {
    icon: Tag,
    title: "Etiquetas Inteligentes",
    desc: "Gôndola, adesiva, trilho de prateleira e balança. Impressão em lote com código de barras e preço.",
    color: "bg-pink/10 text-pink",
  },
  {
    icon: Shield,
    title: "Segurança Total",
    desc: "Dados criptografados, backup automático e isolamento total entre filiais.",
    color: "bg-slate-accent/10 text-slate-accent",
  },
  {
    icon: Camera,
    title: "Cadastro por Foto (IA)",
    desc: "Tire uma foto do produto e a IA preenche nome, categoria, NCM e preço automaticamente.",
    color: "bg-indigo/10 text-indigo",
  },
  {
    icon: Brain,
    title: "Inteligência Artificial",
    desc: "IA analisa vendas, estoque e finanças e gera diagnósticos e insights prontos para decisão.",
    color: "bg-purple/10 text-purple",
  },
  {
    icon: Monitor,
    title: "TEF Integrado",
    desc: "Pagamento por cartão direto no PDV. Cielo, Rede, Stone, PagSeguro e Mercado Pago.",
    color: "bg-teal/10 text-teal",
  },
];

export function LandingFeatures() {
  return (
    <section id="recursos" className="py-24 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-card/50 to-transparent pointer-events-none" />
      <div className="relative max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <span className="text-primary text-sm font-semibold uppercase tracking-wider">Recursos</span>
            <h2 className="mt-3 font-display text-3xl sm:text-4xl font-extrabold tracking-tight">
              Tudo que seu comércio precisa
            </h2>
            <p className="mt-4 text-muted-foreground max-w-2xl mx-auto text-lg">
              Do caixa à gestão financeira, cada módulo foi construído para a realidade do varejo.
            </p>
          </motion.div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="group relative rounded-2xl border border-border bg-card p-6 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all"
            >
              <div className={`w-12 h-12 rounded-xl ${f.color} flex items-center justify-center mb-4`}>
                <f.icon className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Contextual images */}
        <div className="grid md:grid-cols-2 gap-6 mt-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-2xl overflow-hidden border border-border shadow-lg"
          >
            <img
              src={pdvScreenReal}
              alt="Tela do PDV AnthoSystem durante uma venda real — 5 itens lidos por código de barras, subtotal R$ 252,16, botões de pagamento (Dinheiro, Débito, Crédito, PIX, Voucher, A Prazo) e atalhos do caixa"
              className="w-full h-auto object-cover"
              loading="lazy"
              width="1024"
              height="576"
            />
            <div className="p-4 bg-card">
              <p className="font-semibold text-sm">PDV em operação real</p>
              <p className="text-xs text-muted-foreground">Tela do sistema durante uma venda — leitura por código, totalização e múltiplas formas de pagamento.</p>
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl overflow-hidden border border-border shadow-lg"
          >
            <img src={stockEmployee} alt="Funcionário conferindo estoque com leitor de código de barras" className="w-full h-auto object-cover" loading="lazy" />
            <div className="p-4 bg-card">
              <p className="font-semibold text-sm">Controle de estoque real</p>
              <p className="text-xs text-muted-foreground">Inventário com lotes, validade e alertas automáticos.</p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
