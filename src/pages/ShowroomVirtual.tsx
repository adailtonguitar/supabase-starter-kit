import { useState } from "react";
import { Eye, ChevronLeft, ChevronRight, ShoppingCart, Info, Maximize2, Tag } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import salaEstar from "@/assets/ambientes/sala-estar.jpg";
import salaJantar from "@/assets/ambientes/sala-jantar.jpg";
import quartoCasal from "@/assets/ambientes/quarto-casal.jpg";
import quartoInfantil from "@/assets/ambientes/quarto-infantil.jpg";
import cozinha from "@/assets/ambientes/cozinha.jpg";
import escritorio from "@/assets/ambientes/escritorio.jpg";

interface Hotspot {
  id: string;
  x: number; // % from left
  y: number; // % from top
  productName: string;
  price: number;
  sku: string;
}

interface VirtualRoom {
  id: string;
  name: string;
  description: string;
  image: string;
  hotspots: Hotspot[];
}

const virtualRooms: VirtualRoom[] = [
  {
    id: "sala", name: "Sala de Estar Moderna", description: "Ambiente clean com tons neutros e madeira natural",
    image: salaEstar,
    hotspots: [
      { id: "h1", x: 35, y: 55, productName: "Sofá Retrátil 3L", price: 2890, sku: "SOF-003" },
      { id: "h2", x: 65, y: 70, productName: "Mesa de Centro", price: 590, sku: "MES-010" },
      { id: "h3", x: 80, y: 40, productName: "Rack TV 180cm", price: 890, sku: "RAC-005" },
    ],
  },
  {
    id: "jantar", name: "Sala de Jantar Elegante", description: "Mesa ampla com cadeiras estofadas e iluminação pendente",
    image: salaJantar,
    hotspots: [
      { id: "h4", x: 50, y: 50, productName: "Mesa Jantar 8L", price: 2190, sku: "MES-008" },
      { id: "h5", x: 30, y: 45, productName: "Cadeira Estofada", price: 490, sku: "CAD-012" },
      { id: "h6", x: 75, y: 30, productName: "Buffet Retrô", price: 1290, sku: "BUF-003" },
    ],
  },
  {
    id: "quarto", name: "Quarto de Casal Aconchegante", description: "Cabeceira estofada, iluminação indireta e closet integrado",
    image: quartoCasal,
    hotspots: [
      { id: "h7", x: 50, y: 55, productName: "Cama Box King", price: 3290, sku: "CAM-001" },
      { id: "h8", x: 15, y: 45, productName: "Criado-Mudo", price: 390, sku: "CRI-005" },
      { id: "h9", x: 85, y: 35, productName: "Guarda-Roupa 6P", price: 2490, sku: "GUA-002" },
    ],
  },
  {
    id: "infantil", name: "Quarto Infantil Divertido", description: "Cores vibrantes, beliche e espaço para brincar",
    image: quartoInfantil,
    hotspots: [
      { id: "h10", x: 40, y: 50, productName: "Beliche Infantil", price: 1890, sku: "BEL-001" },
      { id: "h11", x: 70, y: 60, productName: "Escrivaninha Kids", price: 590, sku: "ESC-003" },
    ],
  },
  {
    id: "cozinha", name: "Cozinha Planejada", description: "Armários sob medida com bancada em quartzo",
    image: cozinha,
    hotspots: [
      { id: "h12", x: 50, y: 40, productName: "Armário Superior", price: 1590, sku: "ARM-010" },
      { id: "h13", x: 50, y: 70, productName: "Armário Inferior", price: 1890, sku: "ARM-011" },
    ],
  },
  {
    id: "escritorio", name: "Home Office Produtivo", description: "Escrivaninha ampla com organização inteligente",
    image: escritorio,
    hotspots: [
      { id: "h14", x: 50, y: 55, productName: "Escrivaninha", price: 690, sku: "ESC-001" },
      { id: "h15", x: 30, y: 40, productName: "Estante Modular", price: 990, sku: "EST-007" },
    ],
  },
];

export default function ShowroomVirtual() {
  const [currentRoom, setCurrentRoom] = useState(0);
  const [activeHotspot, setActiveHotspot] = useState<Hotspot | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const room = virtualRooms[currentRoom];

  const prevRoom = () => setCurrentRoom(i => (i - 1 + virtualRooms.length) % virtualRooms.length);
  const nextRoom = () => setCurrentRoom(i => (i + 1) % virtualRooms.length);

  const totalValue = room.hotspots.reduce((a, h) => a + h.price, 0);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Eye className="w-6 h-6 text-primary" /> Showroom Virtual
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Tour interativo por ambientes decorados com produtos clicáveis</p>
        </div>
        <Badge variant="outline" className="text-sm">{virtualRooms.length} ambientes</Badge>
      </div>

      {/* Room navigator */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {virtualRooms.map((r, i) => (
          <button key={r.id} onClick={() => setCurrentRoom(i)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${i === currentRoom ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>
            {r.name.split(" ").slice(0, 2).join(" ")}
          </button>
        ))}
      </div>

      {/* Virtual room viewer */}
      <Card className="overflow-hidden">
        <div className="relative aspect-[16/9] bg-muted">
          <img src={room.image} alt={room.name} className="w-full h-full object-cover" />
          
          {/* Hotspots */}
          {room.hotspots.map(h => (
            <button key={h.id} onClick={() => setActiveHotspot(h)}
              className="absolute w-8 h-8 -translate-x-1/2 -translate-y-1/2 group"
              style={{ left: `${h.x}%`, top: `${h.y}%` }}>
              <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
              <span className="relative flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground shadow-lg text-xs font-bold group-hover:scale-110 transition-transform">
                <Tag className="w-3.5 h-3.5" />
              </span>
              <span className="absolute left-10 top-1/2 -translate-y-1/2 bg-background/90 backdrop-blur px-2 py-1 rounded text-xs font-medium whitespace-nowrap shadow opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                {h.productName} — R$ {h.price.toLocaleString("pt-BR")}
              </span>
            </button>
          ))}

          {/* Navigation arrows */}
          <Button variant="secondary" size="icon" className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full shadow-lg opacity-80 hover:opacity-100" onClick={prevRoom}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <Button variant="secondary" size="icon" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full shadow-lg opacity-80 hover:opacity-100" onClick={nextRoom}>
            <ChevronRight className="w-5 h-5" />
          </Button>

          {/* Room info overlay */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-12">
            <h2 className="text-white text-lg font-bold">{room.name}</h2>
            <p className="text-white/80 text-sm">{room.description}</p>
            <div className="flex items-center gap-3 mt-2">
              <Badge className="bg-white/20 text-white border-white/30">{room.hotspots.length} produtos</Badge>
              <Badge className="bg-white/20 text-white border-white/30">Ambiente completo: R$ {totalValue.toLocaleString("pt-BR")}</Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* Products in this room */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {room.hotspots.map(h => (
          <Card key={h.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveHotspot(h)}>
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">{h.productName}</p>
                <p className="text-xs text-muted-foreground">SKU: {h.sku}</p>
              </div>
              <span className="text-lg font-bold text-primary">R$ {h.price.toLocaleString("pt-BR")}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Product detail dialog */}
      <Dialog open={!!activeHotspot} onOpenChange={() => setActiveHotspot(null)}>
        <DialogContent className="max-w-sm">
          {activeHotspot && (
            <>
              <DialogHeader><DialogTitle>{activeHotspot.productName}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="aspect-square bg-muted rounded-lg flex items-center justify-center">
                  <ShoppingCart className="w-12 h-12 text-muted-foreground/30" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">SKU: {activeHotspot.sku}</span>
                  <span className="text-2xl font-bold text-primary">R$ {activeHotspot.price.toLocaleString("pt-BR")}</span>
                </div>
                <p className="text-xs text-muted-foreground">Ambiente: {room.name}</p>
                <Button className="w-full gap-2"><ShoppingCart className="w-4 h-4" /> Adicionar ao Orçamento</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
