import { useState } from "react";
import { Ruler, Plus, Trash2, Save, Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface WallMeasure {
  id: string;
  wall: string;
  width: number;
  height: number;
  obstacles: string;
}

interface RoomMeasurement {
  id: string;
  clientName: string;
  room: string;
  date: string;
  notes: string;
  walls: WallMeasure[];
}

const mockMeasurements: RoomMeasurement[] = [
  {
    id: "1", clientName: "Carlos Oliveira", room: "Quarto Casal", date: "2026-03-04", notes: "Piso nivelado, tomada atrás da cama",
    walls: [
      { id: "w1", wall: "Parede A (cabeceira)", width: 320, height: 270, obstacles: "1 tomada, 1 interruptor" },
      { id: "w2", wall: "Parede B (janela)", width: 400, height: 270, obstacles: "Janela 150x120cm" },
      { id: "w3", wall: "Parede C (porta)", width: 320, height: 270, obstacles: "Porta 80x210cm" },
    ],
  },
];

export default function MedicaoAmbiente() {
  const [measurements, setMeasurements] = useState<RoomMeasurement[]>(mockMeasurements);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ clientName: "", room: "Quarto Casal", notes: "" });
  const [walls, setWalls] = useState<WallMeasure[]>([
    { id: crypto.randomUUID(), wall: "Parede A", width: 0, height: 270, obstacles: "" },
  ]);

  const addWall = () => setWalls(prev => [...prev, { id: crypto.randomUUID(), wall: `Parede ${String.fromCharCode(65 + prev.length)}`, width: 0, height: 270, obstacles: "" }]);
  const removeWall = (id: string) => setWalls(prev => prev.filter(w => w.id !== id));
  const updateWall = (id: string, field: keyof WallMeasure, value: any) => setWalls(prev => prev.map(w => w.id === id ? { ...w, [field]: value } : w));

  const handleSave = () => {
    if (!form.clientName || !form.room) { toast.error("Preencha cliente e ambiente"); return; }
    const entry: RoomMeasurement = {
      id: crypto.randomUUID(), ...form, date: new Date().toISOString().split("T")[0], walls,
    };
    setMeasurements(prev => [entry, ...prev]);
    setForm({ clientName: "", room: "Quarto Casal", notes: "" });
    setWalls([{ id: crypto.randomUUID(), wall: "Parede A", width: 0, height: 270, obstacles: "" }]);
    setDialogOpen(false);
    toast.success("Medição salva com sucesso!");
  };

  const printMeasurement = (m: RoomMeasurement) => {
    const content = `MEDIÇÃO DE AMBIENTE\n${"=".repeat(40)}\nCliente: ${m.clientName}\nAmbiente: ${m.room}\nData: ${m.date}\nObs: ${m.notes}\n\n${m.walls.map(w => `${w.wall}: ${w.width}cm x ${w.height}cm | Obstáculos: ${w.obstacles || "Nenhum"}`).join("\n")}`;
    const win = window.open("", "_blank");
    if (win) { win.document.write(`<pre style="font-family:monospace;padding:20px">${content}</pre>`); win.print(); }
  };

  const rooms = ["Quarto Casal", "Quarto Solteiro", "Sala de Estar", "Sala de Jantar", "Cozinha", "Escritório", "Banheiro", "Área de Serviço", "Varanda"];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Ruler className="w-6 h-6 text-primary" /> Medição de Ambientes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Registre dimensões do espaço do cliente para garantir encaixe perfeito</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><Plus className="w-4 h-4" /> Nova Medição</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Nova Medição de Ambiente</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Cliente</Label><Input placeholder="Nome do cliente" value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} /></div>
                <div><Label>Ambiente</Label>
                  <Select value={form.room} onValueChange={v => setForm(f => ({ ...f, room: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{rooms.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Observações</Label><Textarea placeholder="Piso irregular, instalação elétrica..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Paredes</Label>
                  <Button variant="outline" size="sm" onClick={addWall}><Plus className="w-3 h-3 mr-1" /> Parede</Button>
                </div>
                {walls.map(w => (
                  <Card key={w.id} className="p-3">
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <div className="space-y-2">
                        <Input placeholder="Nome (ex: Parede A)" value={w.wall} onChange={e => updateWall(w.id, "wall", e.target.value)} className="text-sm" />
                        <div className="grid grid-cols-2 gap-2">
                          <div><Label className="text-xs">Largura (cm)</Label><Input type="number" value={w.width || ""} onChange={e => updateWall(w.id, "width", +e.target.value)} /></div>
                          <div><Label className="text-xs">Altura (cm)</Label><Input type="number" value={w.height || ""} onChange={e => updateWall(w.id, "height", +e.target.value)} /></div>
                        </div>
                        <Input placeholder="Obstáculos (janela, tomada...)" value={w.obstacles} onChange={e => updateWall(w.id, "obstacles", e.target.value)} className="text-xs" />
                      </div>
                      {walls.length > 1 && <Button variant="ghost" size="icon" className="mt-1" onClick={() => removeWall(w.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>}
                    </div>
                  </Card>
                ))}
              </div>
              <Button onClick={handleSave} className="w-full gap-1.5"><Save className="w-4 h-4" /> Salvar Medição</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-4">
        {measurements.map(m => (
          <Card key={m.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">{m.clientName} — {m.room}</CardTitle>
                  <p className="text-xs text-muted-foreground">{m.date} {m.notes && `• ${m.notes}`}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => printMeasurement(m)} className="gap-1"><Printer className="w-3.5 h-3.5" /> Imprimir</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {m.walls.map(w => (
                  <div key={w.id} className="bg-muted/50 rounded-lg p-3 border">
                    <p className="font-medium text-sm">{w.wall}</p>
                    <p className="text-lg font-bold text-primary">{w.width} × {w.height} cm</p>
                    {w.obstacles && <Badge variant="secondary" className="text-[10px] mt-1">{w.obstacles}</Badge>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
