import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Star, Camera, Plus, Armchair } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useCustomerReviews } from "@/hooks/useCustomerReviews";
import { Skeleton } from "@/components/ui/skeleton";

export default function AvaliacoesClientes() {
  const { reviews, loading, avgRating, addReview } = useCustomerReviews();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ clientName: "", rating: 5, comment: "", ambienteName: "", photo: "" });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!form.clientName || !form.comment) {
      toast.error("Preencha nome e comentário");
      return;
    }
    setSaving(true);
    await addReview(form);
    setSaving(false);
    setShowForm(false);
    setForm({ clientName: "", rating: 5, comment: "", ambienteName: "", photo: "" });
  };

  const handlePhotoUpload = (files: FileList | null) => {
    if (!files?.[0]) return;
    const reader = new FileReader();
    reader.onload = (e) => setForm(prev => ({ ...prev, photo: e.target?.result as string }));
    reader.readAsDataURL(files[0]);
  };

  const renderStars = (rating: number, interactive = false, onChange?: (r: number) => void) => (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(star => (
        <Star
          key={star}
          className={`w-4 h-4 ${star <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"} ${interactive ? "cursor-pointer" : ""}`}
          onClick={() => interactive && onChange?.(star)}
        />
      ))}
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-sm">⭐ Avaliações de Clientes</h3>
          <Badge variant="secondary" className="text-xs">
            {avgRating.toFixed(1)} média • {reviews.length} avaliações
          </Badge>
        </div>
        <Button size="sm" onClick={() => setShowForm(true)} className="gap-1">
          <Plus className="w-3.5 h-3.5" /> Nova Avaliação
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <AnimatePresence mode="popLayout">
          {reviews.slice(0, 6).map((review, i) => (
            <motion.div key={review.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }}>
              <Card className="overflow-hidden">
                {review.photo && (
                  <div className="aspect-[16/9] overflow-hidden">
                    <img src={review.photo} alt="Ambiente montado" className="w-full h-full object-cover" />
                  </div>
                )}
                <CardContent className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{review.clientName}</p>
                    {renderStars(review.rating)}
                  </div>
                  {review.ambienteName && (
                    <Badge variant="outline" className="text-[10px]">
                      <Armchair className="w-2.5 h-2.5 mr-0.5" /> {review.ambienteName}
                    </Badge>
                  )}
                  <p className="text-xs text-muted-foreground line-clamp-3">{review.comment}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(review.createdAt).toLocaleDateString("pt-BR")}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {reviews.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">Nenhuma avaliação ainda. Adicione a primeira!</p>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Avaliação</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome do Cliente *</Label>
              <Input value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })} placeholder="Nome completo" />
            </div>
            <div>
              <Label>Ambiente</Label>
              <Input value={form.ambienteName} onChange={e => setForm({ ...form, ambienteName: e.target.value })} placeholder="Ex: Sala de Estar, Quarto" />
            </div>
            <div>
              <Label>Nota</Label>
              <div className="mt-1">{renderStars(form.rating, true, (r) => setForm({ ...form, rating: r }))}</div>
            </div>
            <div>
              <Label>Comentário *</Label>
              <Textarea value={form.comment} onChange={e => setForm({ ...form, comment: e.target.value })} placeholder="O que o cliente achou?" rows={3} />
            </div>
            <div>
              <Label>Foto do ambiente montado (opcional)</Label>
              <div className="mt-1">
                {form.photo ? (
                  <div className="relative">
                    <img src={form.photo} alt="Preview" className="w-full h-32 object-cover rounded-lg" />
                    <Button size="icon" variant="destructive" className="absolute top-1 right-1 h-6 w-6" onClick={() => setForm({ ...form, photo: "" })}>×</Button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 p-6 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/30 transition-colors">
                    <Camera className="w-5 h-5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Clique para adicionar foto</span>
                    <input type="file" accept="image/*" className="hidden" onChange={e => handlePhotoUpload(e.target.files)} />
                  </label>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={saving}>{saving ? "Salvando..." : "Salvar Avaliação"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
