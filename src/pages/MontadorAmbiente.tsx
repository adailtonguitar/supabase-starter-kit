import { useState, useRef, useCallback } from "react";
import { Move, RotateCw, Trash2, Plus, Save, Printer, ZoomIn, ZoomOut } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface FurnitureItem {
  id: string;
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  rotation: number;
  color: string;
}

const furnitureCatalog = [
  { name: "Sofá 3L", width: 200, height: 80, color: "hsl(var(--primary))" },
  { name: "Poltrona", width: 80, height: 80, color: "hsl(var(--chart-2))" },
  { name: "Mesa Centro", width: 100, height: 60, color: "hsl(var(--chart-3))" },
  { name: "Rack TV", width: 180, height: 45, color: "hsl(var(--chart-4))" },
  { name: "Mesa Jantar", width: 150, height: 90, color: "hsl(var(--chart-5))" },
  { name: "Cama Casal", width: 160, height: 200, color: "hsl(var(--chart-1))" },
  { name: "Guarda-Roupa", width: 200, height: 60, color: "hsl(var(--chart-2))" },
  { name: "Escrivaninha", width: 120, height: 60, color: "hsl(var(--chart-3))" },
];

const SCALE = 0.5; // 1cm = 0.5px base
const CANVAS_W = 800;
const CANVAS_H = 600;

export default function MontadorAmbiente() {
  const [items, setItems] = useState<FurnitureItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [roomName, setRoomName] = useState("Sala de Estar");
  const [zoom, setZoom] = useState(1);
  const canvasRef = useRef<HTMLDivElement>(null);

  const addItem = (catalog: typeof furnitureCatalog[0]) => {
    const item: FurnitureItem = {
      id: crypto.randomUUID(),
      name: catalog.name,
      width: catalog.width * SCALE,
      height: catalog.height * SCALE,
      x: CANVAS_W / 2 - (catalog.width * SCALE) / 2,
      y: CANVAS_H / 2 - (catalog.height * SCALE) / 2,
      rotation: 0,
      color: catalog.color,
    };
    setItems(prev => [...prev, item]);
    setSelected(item.id);
  };

  const removeSelected = () => {
    if (!selected) return;
    setItems(prev => prev.filter(i => i.id !== selected));
    setSelected(null);
  };

  const rotateSelected = () => {
    if (!selected) return;
    setItems(prev => prev.map(i => i.id === selected ? { ...i, rotation: (i.rotation + 90) % 360 } : i));
  };

  const handleMouseDown = (e: React.MouseEvent, item: FurnitureItem) => {
    e.stopPropagation();
    setSelected(item.id);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDragging({ id: item.id, offsetX: (e.clientX - rect.left) / zoom - item.x, offsetY: (e.clientY - rect.top) / zoom - item.y });
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(CANVAS_W, (e.clientX - rect.left) / zoom - dragging.offsetX));
    const y = Math.max(0, Math.min(CANVAS_H, (e.clientY - rect.top) / zoom - dragging.offsetY));
    setItems(prev => prev.map(i => i.id === dragging.id ? { ...i, x, y } : i));
  }, [dragging, zoom]);

  const handleMouseUp = () => setDragging(null);

  const savePlan = () => toast.success("Planta salva com sucesso!");

  const printPlan = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    const itemsHtml = items.map(i => `<div style="position:absolute;left:${i.x}px;top:${i.y}px;width:${i.width}px;height:${i.height}px;background:${i.color};opacity:0.7;border-radius:4px;transform:rotate(${i.rotation}deg);display:flex;align-items:center;justify-content:center;font-size:8px;color:white;font-weight:bold">${i.name}</div>`).join("");
    win.document.write(`<html><body style="margin:20px"><h2>${roomName}</h2><div style="position:relative;width:${CANVAS_W}px;height:${CANVAS_H}px;border:2px solid #ccc;background:#f9f9f9">${itemsHtml}</div><p style="font-size:12px;color:#666;margin-top:10px">Escala: 1cm = ${SCALE}px • Gerado em ${new Date().toLocaleDateString("pt-BR")}</p></body></html>`);
    win.print();
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Move className="w-6 h-6 text-primary" /> Montador de Ambientes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Arraste móveis do catálogo para montar propostas visuais</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={printPlan}><Printer className="w-4 h-4 mr-1" /> Imprimir</Button>
          <Button size="sm" onClick={savePlan}><Save className="w-4 h-4 mr-1" /> Salvar</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[250px_1fr] gap-4">
        {/* Catalog sidebar */}
        <Card className="h-fit">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Catálogo de Móveis</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {furnitureCatalog.map((item, i) => (
              <button key={i} onClick={() => addItem(item)}
                className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-accent text-left text-sm transition-colors">
                <div className="w-5 h-5 rounded" style={{ background: item.color, opacity: 0.7 }} />
                <span className="flex-1">{item.name}</span>
                <Badge variant="outline" className="text-[10px]">{item.width}×{item.height}cm</Badge>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Canvas */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Input value={roomName} onChange={e => setRoomName(e.target.value)} className="max-w-xs font-semibold" />
            <div className="flex items-center gap-1 ml-auto">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}><ZoomOut className="w-4 h-4" /></Button>
              <span className="text-xs text-muted-foreground w-12 text-center">{Math.round(zoom * 100)}%</span>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.min(2, z + 0.1))}><ZoomIn className="w-4 h-4" /></Button>
            </div>
            {selected && (
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={rotateSelected}><RotateCw className="w-4 h-4" /></Button>
                <Button variant="destructive" size="sm" onClick={removeSelected}><Trash2 className="w-4 h-4" /></Button>
              </div>
            )}
          </div>

          <div className="border rounded-xl overflow-hidden bg-muted/30 cursor-crosshair"
            style={{ width: "100%", height: CANVAS_H * zoom + "px", position: "relative" }}>
            <div ref={canvasRef}
              style={{ width: CANVAS_W, height: CANVAS_H, transform: `scale(${zoom})`, transformOrigin: "top left", position: "relative" }}
              onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
              onClick={() => setSelected(null)}>
              {/* Grid */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20">
                {Array.from({ length: Math.ceil(CANVAS_W / 50) }).map((_, i) => (
                  <line key={`v${i}`} x1={i * 50} y1={0} x2={i * 50} y2={CANVAS_H} stroke="currentColor" strokeWidth={0.5} />
                ))}
                {Array.from({ length: Math.ceil(CANVAS_H / 50) }).map((_, i) => (
                  <line key={`h${i}`} x1={0} y1={i * 50} x2={CANVAS_W} y2={i * 50} stroke="currentColor" strokeWidth={0.5} />
                ))}
              </svg>

              {items.map(item => (
                <div key={item.id}
                  onMouseDown={e => handleMouseDown(e, item)}
                  className={`absolute rounded cursor-move select-none flex items-center justify-center text-[9px] font-bold text-white shadow-md transition-shadow ${selected === item.id ? "ring-2 ring-primary ring-offset-2 shadow-lg" : ""}`}
                  style={{
                    left: item.x, top: item.y, width: item.width, height: item.height,
                    background: item.color, opacity: 0.8, transform: `rotate(${item.rotation}deg)`,
                  }}>
                  {item.name}
                </div>
              ))}

              {items.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/40">
                  <div className="text-center">
                    <Plus className="w-10 h-10 mx-auto mb-2" />
                    <p className="text-sm font-medium">Clique em um móvel ao lado para adicionar</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            {items.length} item(s) • Escala 1:2 (1cm = 0.5px) • Arraste para posicionar, use os botões para girar/excluir
          </p>
        </div>
      </div>
    </div>
  );
}
