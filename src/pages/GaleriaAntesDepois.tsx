import { useState } from "react";
import { Camera, Plus, Star, ImageIcon, Trash2, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useFurnitureProjects } from "@/hooks/useFurnitureProjects";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

function PhotoUpload({ label, currentUrl, onUpload }: { label: string; currentUrl: string; onUpload: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const path = `projects/${crypto.randomUUID()}-${file.name}`;
      const { error } = await supabase.storage.from("furniture-photos").upload(path, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("furniture-photos").getPublicUrl(path);
      onUpload(publicUrl);
      toast.success(`Foto "${label}" enviada!`);
    } catch { toast.error("Erro no upload"); }
    setUploading(false);
  };

  return (
    <div>
      <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wider">{label}</p>
      {currentUrl ? (
        <img src={currentUrl} alt={label} className="w-full aspect-[4/3] object-cover rounded-lg" />
      ) : (
        <label className="w-full aspect-[4/3] bg-muted rounded-lg flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-accent transition-colors">
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={uploading} />
          {uploading ? (
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Upload className="w-8 h-8 text-muted-foreground/40" />
              <span className="text-xs text-muted-foreground/60 font-medium">Clique para enviar</span>
            </>
          )}
        </label>
      )}
    </div>
  );
}

export default function GaleriaAntesDepois() {
  const { projects, loading, create, updatePhotos, remove } = useFurnitureProjects();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ client_name: "", room: "", description: "" });

  const handleAdd = () => {
    if (!form.client_name || !form.room) { toast.error("Preencha cliente e ambiente"); return; }
    create(form);
    setForm({ client_name: "", room: "", description: "" });
    setDialogOpen(false);
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
              <Input placeholder="Nome do cliente" value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} />
              <Input placeholder="Ambiente (ex: Sala de Estar)" value={form.room} onChange={e => setForm(f => ({ ...f, room: e.target.value }))} />
              <Textarea placeholder="Descrição da transformação" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              <Button onClick={handleAdd} className="w-full">Salvar Projeto</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {projects.map(entry => (
            <Card key={entry.id} className="overflow-hidden hover:shadow-lg transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">{entry.room}</CardTitle>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-xs">{new Date(entry.created_at).toLocaleDateString("pt-BR")}</Badge>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => remove(entry.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{entry.client_name}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <PhotoUpload label="Antes" currentUrl={entry.before_url} onUpload={url => updatePhotos(entry.id, url, entry.after_url)} />
                  <PhotoUpload label="Depois" currentUrl={entry.after_url} onUpload={url => updatePhotos(entry.id, entry.before_url, url)} />
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
      )}

      {!loading && projects.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <Camera className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhum projeto cadastrado</p>
          <p className="text-sm">Adicione fotos de antes e depois para impressionar seus clientes</p>
        </div>
      )}
    </div>
  );
}
