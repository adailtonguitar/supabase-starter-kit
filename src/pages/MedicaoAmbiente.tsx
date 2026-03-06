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
import { useRoomMeasurements } from "@/hooks/useRoomMeasurements";
import { toast } from "sonner";

interface WallForm {
  id: string; wall: string; width: number; height: number; obstacles: string;
}

export default function MedicaoAmbiente() {
  const { measurements, loading, create, remove } = useRoomMeasurements();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ client_name: "", room: "Quarto Casal", notes: "" });
  const [walls, setWalls] = useState<WallForm[]>([
    { id: crypto.randomUUID(), wall: "Parede A", width: 0, height: 270, obstacles: "" },
  ]);

  const addWall = () => setWalls(prev => [...prev, { id: crypto.randomUUID(), wall: `Parede ${String.fromCharCode(65 + prev.length)}`, width: 0, height: 270, obstacles: "" }]);
  const removeWall = (id: string) => setWalls(prev => prev.filter(w => w.id !== id));
  const updateWall = (id: string, field: keyof WallForm, value: any) => setWalls(prev => prev.map(w => w.id === id ? { ...w, [field]: value } : w));

  const handleSave = () => {
    if (!form.client_name || !form.room) { toast.error("Preencha cliente e ambiente"); return; }
    create({ ...form, walls });
    setForm({ client_name: "", room: "Quarto Casal", notes: "" });
    setWalls([{ id: crypto.randomUUID(), wall: "Parede A", width: 0, height: 270, obstacles: "" }]);
    setDialogOpen(false);
  };

  const printMeasurement = (m: typeof measurements[0]) => {
    const content = `MEDIÇÃO DE AMBIENTE\n${"=".repeat(40)}\nCliente: ${m.client_name}\nAmbiente: ${m.room}\nData: ${new Date(m.created_at).toLocaleDateString("pt-BR")}\nObs: ${m.notes}\n\n${(m.walls || []).map((w: any) => `${w.wall}: ${w.width}cm x ${w.height}cm | Obstáculos: ${w.obstacles || "Nenhum"}`).join("\n")}`;
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
                <div><Label>Cliente</Label><Input placeholder="Nome do cliente" value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} /></div>
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

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-4">
          {measurements.map(m => (
            <Card key={m.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{m.client_name} — {m.room}</CardTitle>
                    <p className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleDateString("pt-BR")} {m.notes && `• ${m.notes}`}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" onClick={() => printMeasurement(m)} className="gap-1"><Printer className="w-3.5 h-3.5" /> Imprimir</Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(m.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {(m.walls || []).map((w: any, i: number) => (
                    <div key={i} className="bg-muted/50 rounded-lg p-3 border">
                      <p className="font-medium text-sm">{w.wall}</p>
                      <p className="text-lg font-bold text-primary">{w.width} × {w.height} cm</p>
                      {w.obstacles && <Badge variant="secondary" className="text-[10px] mt-1">{w.obstacles}</Badge>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
          {measurements.length === 0 && (
            <div className="text-center py-20 text-muted-foreground">
              <Ruler className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Nenhuma medição cadastrada</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
