import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Home, ShoppingCart, Eye, Sparkles, Copy, Check, Armchair } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

import imgSalaEstar from "@/assets/ambientes/sala-estar.jpg";
import imgQuartoCasal from "@/assets/ambientes/quarto-casal.jpg";
import imgSalaJantar from "@/assets/ambientes/sala-jantar.jpg";
import imgEscritorio from "@/assets/ambientes/escritorio.jpg";
import imgQuartoInfantil from "@/assets/ambientes/quarto-infantil.jpg";
import imgCozinha from "@/assets/ambientes/cozinha.jpg";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface ComboItem {
  name: string;
  category: string;
  price: number;
  quantity: number;
}

interface Ambiente {
  id: string;
  name: string;
  description: string;
  image: string;
  tags: string[];
  combos: {
    id: string;
    name: string;
    description: string;
    items: ComboItem[];
    discount: number; // percentage
  }[];
}

const ambientes: Ambiente[] = [
  {
    id: "sala-estar",
    name: "Sala de Estar",
    description: "Ambiente aconchegante para reunir a família. Sofás confortáveis, rack para TV e mesa de centro.",
    image: imgSalaEstar,
    tags: ["Popular", "Família"],
    combos: [
      {
        id: "sala-completa",
        name: "Sala Completa",
        description: "Combo completo com sofá, rack e mesa de centro",
        items: [
          { name: "Sofá 3 Lugares Couro", category: "Sala de Estar", price: 3299, quantity: 1 },
          { name: "Rack para TV 180cm", category: "Sala de Estar", price: 1899, quantity: 1 },
          { name: "Mesa de Centro Madeira", category: "Sala de Estar", price: 899, quantity: 1 },
          { name: "Poltrona Decorativa", category: "Sala de Estar", price: 1299, quantity: 1 },
        ],
        discount: 10,
      },
      {
        id: "sala-essencial",
        name: "Sala Essencial",
        description: "O básico para sua sala — sofá e rack",
        items: [
          { name: "Sofá 3 Lugares Couro", category: "Sala de Estar", price: 3299, quantity: 1 },
          { name: "Rack para TV 180cm", category: "Sala de Estar", price: 1899, quantity: 1 },
        ],
        discount: 5,
      },
    ],
  },
  {
    id: "quarto-casal",
    name: "Quarto de Casal",
    description: "Quarto elegante e funcional com cama box, guarda-roupa e criados-mudo.",
    image: imgQuartoCasal,
    tags: ["Best-seller"],
    combos: [
      {
        id: "quarto-completo",
        name: "Quarto Completo",
        description: "Cama, guarda-roupa, 2 criados e cômoda",
        items: [
          { name: "Cama Box Casal Queen", category: "Quarto", price: 4599, quantity: 1 },
          { name: "Guarda-Roupa 4 Portas", category: "Quarto", price: 3899, quantity: 1 },
          { name: "Criado-Mudo 2 Gavetas", category: "Quarto", price: 599, quantity: 2 },
          { name: "Cômoda 5 Gavetas", category: "Quarto", price: 1299, quantity: 1 },
        ],
        discount: 12,
      },
      {
        id: "quarto-basico",
        name: "Quarto Básico",
        description: "Cama e guarda-roupa",
        items: [
          { name: "Cama Box Casal Queen", category: "Quarto", price: 4599, quantity: 1 },
          { name: "Guarda-Roupa 4 Portas", category: "Quarto", price: 3899, quantity: 1 },
        ],
        discount: 8,
      },
    ],
  },
  {
    id: "sala-jantar",
    name: "Sala de Jantar",
    description: "Mesa de jantar com cadeiras e buffet para refeições em família.",
    image: imgSalaJantar,
    tags: ["Elegante"],
    combos: [
      {
        id: "jantar-completo",
        name: "Jantar Completo",
        description: "Mesa 6 lugares, cadeiras e buffet",
        items: [
          { name: "Mesa de Jantar 6 Lugares", category: "Sala de Jantar", price: 2499, quantity: 1 },
          { name: "Cadeira Estofada", category: "Sala de Jantar", price: 449, quantity: 6 },
          { name: "Buffet 3 Portas", category: "Sala de Jantar", price: 1799, quantity: 1 },
        ],
        discount: 10,
      },
    ],
  },
  {
    id: "escritorio",
    name: "Home Office",
    description: "Espaço produtivo com escrivaninha, cadeira ergonômica e estante.",
    image: imgEscritorio,
    tags: ["Tendência"],
    combos: [
      {
        id: "office-completo",
        name: "Office Completo",
        description: "Escrivaninha, cadeira, estante e gaveteiro",
        items: [
          { name: "Escrivaninha Home Office", category: "Escritório", price: 1599, quantity: 1 },
          { name: "Cadeira Ergonômica", category: "Escritório", price: 1899, quantity: 1 },
          { name: "Estante 5 Prateleiras", category: "Escritório", price: 899, quantity: 1 },
          { name: "Gaveteiro com Rodízios", category: "Escritório", price: 499, quantity: 1 },
        ],
        discount: 8,
      },
    ],
  },
  {
    id: "quarto-infantil",
    name: "Quarto Infantil",
    description: "Quarto lúdico e colorido para crianças, com cama, escrivaninha e estante.",
    image: imgQuartoInfantil,
    tags: ["Colorido"],
    combos: [
      {
        id: "infantil-completo",
        name: "Infantil Completo",
        description: "Cama, guarda-roupa, escrivaninha e estante",
        items: [
          { name: "Cama Solteiro Infantil", category: "Quarto Infantil", price: 1899, quantity: 1 },
          { name: "Guarda-Roupa Infantil", category: "Quarto Infantil", price: 2299, quantity: 1 },
          { name: "Escrivaninha Infantil", category: "Quarto Infantil", price: 899, quantity: 1 },
          { name: "Estante Organizadora", category: "Quarto Infantil", price: 699, quantity: 1 },
        ],
        discount: 15,
      },
    ],
  },
  {
    id: "cozinha",
    name: "Cozinha",
    description: "Cozinha moderna com balcão, banquetas e armários planejados.",
    image: imgCozinha,
    tags: ["Moderno"],
    combos: [
      {
        id: "cozinha-completa",
        name: "Cozinha Completa",
        description: "Balcão ilha, banquetas e armário aéreo",
        items: [
          { name: "Balcão Ilha com Pia", category: "Cozinha", price: 3499, quantity: 1 },
          { name: "Banqueta Alta", category: "Cozinha", price: 599, quantity: 4 },
          { name: "Armário Aéreo 3 Portas", category: "Cozinha", price: 1299, quantity: 2 },
        ],
        discount: 10,
      },
    ],
  },
];

interface Props {
  onGenerateQuote?: (items: { name: string; price: number; quantity: number }[], totalWithDiscount: number, ambienteName: string) => void;
}

export default function AmbientesGallery({ onGenerateQuote }: Props) {
  const [selectedAmbiente, setSelectedAmbiente] = useState<Ambiente | null>(null);
  const [selectedCombo, setSelectedCombo] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  const openAmbiente = (amb: Ambiente) => {
    setSelectedAmbiente(amb);
    setSelectedCombo(amb.combos[0]?.id || null);
    // Select all items by default
    const items: Record<string, boolean> = {};
    amb.combos[0]?.items.forEach((_, i) => { items[`${amb.combos[0].id}-${i}`] = true; });
    setSelectedItems(items);
  };

  const handleComboChange = (comboId: string) => {
    setSelectedCombo(comboId);
    const combo = selectedAmbiente?.combos.find(c => c.id === comboId);
    if (combo) {
      const items: Record<string, boolean> = {};
      combo.items.forEach((_, i) => { items[`${comboId}-${i}`] = true; });
      setSelectedItems(items);
    }
  };

  const activeCombo = selectedAmbiente?.combos.find(c => c.id === selectedCombo);

  const getComboTotal = (combo: typeof activeCombo) => {
    if (!combo) return { subtotal: 0, discount: 0, total: 0 };
    const subtotal = combo.items.reduce((s, item, i) => {
      if (!selectedItems[`${combo.id}-${i}`]) return s;
      return s + item.price * item.quantity;
    }, 0);
    const discount = subtotal * (combo.discount / 100);
    return { subtotal, discount, total: subtotal - discount };
  };

  const handleCopyQuote = () => {
    if (!activeCombo || !selectedAmbiente) return;
    const { subtotal, discount, total } = getComboTotal(activeCombo);
    const lines = [
      `🏠 ORÇAMENTO — ${selectedAmbiente.name}`,
      `📦 Combo: ${activeCombo.name}`,
      ``,
      ...activeCombo.items
        .filter((_, i) => selectedItems[`${activeCombo.id}-${i}`])
        .map(item => `• ${item.quantity}x ${item.name} — ${fmt(item.price * item.quantity)}`),
      ``,
      `Subtotal: ${fmt(subtotal)}`,
      `Desconto (${activeCombo.discount}%): -${fmt(discount)}`,
      `━━━━━━━━━━━━━━━━━━`,
      `💰 TOTAL: ${fmt(total)}`,
    ];
    navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    toast.success("Orçamento copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGenerateQuote = () => {
    if (!activeCombo || !selectedAmbiente) return;
    const { total } = getComboTotal(activeCombo);
    const items = activeCombo.items
      .filter((_, i) => selectedItems[`${activeCombo.id}-${i}`])
      .map(item => ({ name: item.name, price: item.price, quantity: item.quantity }));
    if (onGenerateQuote) {
      onGenerateQuote(items, total, selectedAmbiente.name);
    } else {
      handleCopyQuote();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Home className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold">Ambientes Prontos</h2>
        <Badge variant="secondary" className="text-xs ml-auto">
          <Sparkles className="w-3 h-3 mr-1" />{ambientes.length} ambientes
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground -mt-4">
        Escolha um ambiente decorado e gere um orçamento instantâneo com desconto de combo.
      </p>

      {/* Gallery Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence mode="popLayout">
          {ambientes.map((amb, i) => (
            <motion.div
              key={amb.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card
                className="cursor-pointer group overflow-hidden hover:shadow-lg hover:border-primary/30 transition-all"
                onClick={() => openAmbiente(amb)}
              >
                <div className="aspect-[16/9] relative overflow-hidden">
                  <img
                    src={amb.image}
                    alt={amb.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <h3 className="text-white font-bold text-lg drop-shadow-md">{amb.name}</h3>
                    <p className="text-white/80 text-xs line-clamp-2 mt-0.5">{amb.description}</p>
                  </div>
                  <div className="absolute top-2 right-2 flex gap-1">
                    {amb.tags.map(tag => (
                      <Badge key={tag} className="text-[10px] bg-primary/90 text-primary-foreground border-0">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                    <Eye className="w-10 h-10 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                  </div>
                </div>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {amb.combos.length} combo{amb.combos.length > 1 ? "s" : ""} disponíve{amb.combos.length > 1 ? "is" : "l"}
                    </span>
                    <span className="text-xs font-semibold text-primary">
                      A partir de {fmt(Math.min(...amb.combos.map(c => {
                        const sub = c.items.reduce((s, it) => s + it.price * it.quantity, 0);
                        return sub - sub * (c.discount / 100);
                      })))}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Ambiente Detail Dialog */}
      <Dialog open={!!selectedAmbiente} onOpenChange={() => setSelectedAmbiente(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Home className="w-5 h-5 text-primary" />
              {selectedAmbiente?.name}
            </DialogTitle>
          </DialogHeader>

          {selectedAmbiente && (
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-4 pb-4">
                {/* Image */}
                <div className="aspect-video rounded-lg overflow-hidden">
                  <img src={selectedAmbiente.image} alt={selectedAmbiente.name} className="w-full h-full object-cover" />
                </div>

                <p className="text-sm text-muted-foreground">{selectedAmbiente.description}</p>

                {/* Combo Selector */}
                {selectedAmbiente.combos.length > 1 && (
                  <div className="flex gap-2 flex-wrap">
                    {selectedAmbiente.combos.map(combo => (
                      <Button
                        key={combo.id}
                        variant={selectedCombo === combo.id ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleComboChange(combo.id)}
                      >
                        {combo.name}
                        <Badge variant="secondary" className="ml-1.5 text-[10px]">
                          -{combo.discount}%
                        </Badge>
                      </Button>
                    ))}
                  </div>
                )}

                {/* Active Combo Details */}
                {activeCombo && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-sm">{activeCombo.name}</h4>
                      <Badge variant="outline" className="text-xs">
                        <Sparkles className="w-3 h-3 mr-1" />
                        {activeCombo.discount}% de desconto no combo
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{activeCombo.description}</p>

                    <Separator />

                    {/* Items list with checkboxes */}
                    <div className="space-y-2">
                      {activeCombo.items.map((item, i) => {
                        const key = `${activeCombo.id}-${i}`;
                        const checked = !!selectedItems[key];
                        return (
                          <div
                            key={i}
                            className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${checked ? "bg-primary/5 border-primary/20" : "bg-muted/30 border-border opacity-60"}`}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(val) =>
                                setSelectedItems(prev => ({ ...prev, [key]: !!val }))
                              }
                            />
                            <Armchair className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{item.name}</p>
                              <p className="text-xs text-muted-foreground">{item.category}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-semibold">{fmt(item.price)}</p>
                              {item.quantity > 1 && (
                                <p className="text-[10px] text-muted-foreground">{item.quantity}x = {fmt(item.price * item.quantity)}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <Separator />

                    {/* Totals */}
                    {(() => {
                      const { subtotal, discount, total } = getComboTotal(activeCombo);
                      return (
                        <div className="space-y-1.5 bg-muted/30 rounded-lg p-4">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Subtotal</span>
                            <span>{fmt(subtotal)}</span>
                          </div>
                          <div className="flex justify-between text-sm text-green-600">
                            <span>Desconto combo ({activeCombo.discount}%)</span>
                            <span>-{fmt(discount)}</span>
                          </div>
                          <Separator />
                          <div className="flex justify-between text-lg font-bold">
                            <span>Total</span>
                            <span className="text-primary">{fmt(total)}</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </ScrollArea>
          )}

          <DialogFooter className="flex-row gap-2 sm:gap-2">
            <Button variant="outline" onClick={handleCopyQuote} className="flex-1">
              {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
              {copied ? "Copiado!" : "Copiar Orçamento"}
            </Button>
            <Button onClick={handleGenerateQuote} className="flex-1">
              <ShoppingCart className="w-4 h-4 mr-1" />
              Gerar Orçamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
