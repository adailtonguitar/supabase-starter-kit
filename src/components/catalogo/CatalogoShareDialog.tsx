import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { QrCode, Share2, Copy, Check, MessageCircle } from "lucide-react";
import { toast } from "sonner";

interface ShareItem {
  name: string;
  price: number;
  quantity: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ambienteName: string;
  comboName: string;
  items: ShareItem[];
  total: number;
  discount: number;
  imageUrl?: string;
}

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function CatalogoShareDialog({ open, onOpenChange, ambienteName, comboName, items, total, discount, imageUrl }: Props) {
  const [copied, setCopied] = useState(false);
  const [storeName, setStoreName] = useState(() => localStorage.getItem("as_store_name") || "Nossa Loja");
  const [storePhone, setStorePhone] = useState(() => localStorage.getItem("as_store_phone") || "");
  const [customMessage, setCustomMessage] = useState("");

  const buildMessage = () => {
    const lines = [
      `🏠 *${ambienteName} — ${comboName}*`,
      `📍 ${storeName}`,
      ``,
      ...items.map(it => `• ${it.quantity}x ${it.name} — ${fmt(it.price * it.quantity)}`),
      ``,
      `🏷️ Desconto combo: ${discount}%`,
      `💰 *Total: ${fmt(total)}*`,
      ``,
      `💳 Até 12x no cartão!`,
    ];
    if (customMessage) lines.push(``, customMessage);
    if (storePhone) lines.push(``, `📞 Contato: ${storePhone}`);
    lines.push(``, `_Orçamento sujeito a disponibilidade de estoque._`);
    return lines.join("\n");
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(buildMessage());
    setCopied(true);
    toast.success("Texto copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsApp = () => {
    const text = encodeURIComponent(buildMessage());
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const handleSaveSettings = () => {
    localStorage.setItem("as_store_name", storeName);
    localStorage.setItem("as_store_phone", storePhone);
    toast.success("Dados da loja salvos");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-primary" />
            Compartilhar Orçamento
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Store info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Nome da Loja</Label>
              <Input value={storeName} onChange={e => setStoreName(e.target.value)} onBlur={handleSaveSettings} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Telefone</Label>
              <Input value={storePhone} onChange={e => setStorePhone(e.target.value)} onBlur={handleSaveSettings} placeholder="(00) 00000-0000" className="h-9" />
            </div>
          </div>

          {/* Custom message */}
          <div>
            <Label className="text-xs">Mensagem personalizada (opcional)</Label>
            <Textarea value={customMessage} onChange={e => setCustomMessage(e.target.value)} placeholder="Ex: Promoção válida até sexta!" rows={2} />
          </div>

          {/* Preview */}
          <div className="rounded-lg border border-border bg-muted/20 p-3 max-h-[200px] overflow-y-auto">
            <p className="text-xs font-mono whitespace-pre-line">{buildMessage()}</p>
          </div>

          {/* Summary */}
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-xs">{items.length} itens</Badge>
            <span className="text-sm font-bold text-primary">{fmt(total)}</span>
          </div>
        </div>

        <DialogFooter className="flex-row gap-2 sm:gap-2">
          <Button variant="outline" onClick={handleCopy} className="flex-1">
            {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
            {copied ? "Copiado!" : "Copiar"}
          </Button>
          <Button onClick={handleWhatsApp} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
            <MessageCircle className="w-4 h-4 mr-1" />
            WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
