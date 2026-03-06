import { useState } from "react";
import { Camera, Plus, Star, ArrowRight, ImageIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface BeforeAfterEntry {
  id: string;
  clientName: string;
  room: string;
  description: string;
  beforeUrl: string;
  afterUrl: string;
  rating: number;
  date: string;
}

const mockEntries: BeforeAfterEntry[] = [
  {
    id: "1", clientName: "Maria Silva", room: "Sala de Estar",
    description: "Transformação completa com sofá retrátil e rack planejado",
    beforeUrl: "", afterUrl: "", rating: 5, date: "2026-02-15",
  },
  {
    id: "2", clientName: "João Santos", room: "Quarto Casal",
    description: "Guarda-roupa planejado com iluminação LED e cama box king",
    beforeUrl: "", afterUrl: "", rating: 5, date: "2026-02-20",
  },
  {
    id: "3", clientName: "Ana Costa", room: "Cozinha",
    description: "Armários sob medida em MDF branco com bancada em granito",
    beforeUrl: "", afterUrl: "", rating: 4, date: "2026-03-01",
  },
];

function PlaceholderImage({ label }: { label: string }) {
  return (
    <div className="w-full aspect-[4/3] bg-muted rounded-lg flex flex-col items-center justify-center gap-2">
      <ImageIcon className="w-10 h-10 text-muted-foreground/40" />
      <span className="text-xs text-muted-foreground/60 font-medium">{label}</span>
    </div>
  );
}

export default function GaleriaAntesDepois() {
  const [entries, setEntries] = useState<BeforeAfterEntry[]>(mockEntries);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ clientName: "", room: "", description: "" });

  const handleAdd = () => {
    if (!form.clientName || !form.room) { toast.error("Preencha cliente e ambiente"); return; }
    const newEntry: BeforeAfterEntry = {
      id: crypto.randomUUID(),
      ...form,
      beforeUrl: "", afterUrl: "",
      rating: 0, date: new Date().toISOString().split("T")[0],
    };
    setEntries(prev => [newEntry, ...prev]);
    setForm({ clientName: "", room: "", description: "" });
    setDialogOpen(false);
    toast.success("Projeto adicionado! Adicione as fotos depois.");
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Camera className="w-6 h-6 text-primary" /> Galeria Antes & Depois
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Mostre transformações reais para convencer novos clientes</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><Plus className="w-4 h-4" /> Novo Projeto</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Projeto Antes & Depois</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Nome do cliente" value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} />
              <Input placeholder="Ambiente (ex: Sala de Estar)" value={form.room} onChange={e => setForm(f => ({ ...f, room: e.target.value }))} />
              <Textarea placeholder="Descrição da transformação" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              <div className="text-xs text-muted-foreground">📷 As fotos serão adicionadas depois via upload</div>
              <Button onClick={handleAdd} className="w-full">Salvar Projeto</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {entries.map(entry => (
          <Card key={entry.id} className="overflow-hidden hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">{entry.room}</CardTitle>
                <Badge variant="outline" className="text-xs">{entry.date}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{entry.clientName}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 items-center">
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Antes</p>
                  <PlaceholderImage label="Foto Antes" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Depois</p>
                  <PlaceholderImage label="Foto Depois" />
                </div>
              </div>
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 hidden md:flex">
              </div>
              <p className="text-xs text-muted-foreground">{entry.description}</p>
              {entry.rating > 0 && (
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className={`w-3.5 h-3.5 ${i < entry.rating ? "text-amber-500 fill-amber-500" : "text-muted-foreground/30"}`} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {entries.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <Camera className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhum projeto cadastrado</p>
          <p className="text-sm">Adicione fotos de antes e depois para impressionar seus clientes</p>
        </div>
      )}
    </div>
  );
}
