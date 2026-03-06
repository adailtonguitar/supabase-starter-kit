import { useState } from "react";
import { Smartphone, Camera, Box, RotateCw, Move3d, Share2, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const arProducts = [
  { id: "1", name: "Sofá Retrátil 3 Lugares", dimensions: "230×95×90cm", color: "Cinza", price: 2890 },
  { id: "2", name: "Mesa de Jantar 6 Lugares", dimensions: "160×90×78cm", color: "Nogueira", price: 1590 },
  { id: "3", name: "Guarda-Roupa 6 Portas", dimensions: "200×53×240cm", color: "Branco", price: 2490 },
  { id: "4", name: "Rack TV 180cm", dimensions: "180×40×55cm", color: "Off White", price: 890 },
  { id: "5", name: "Cama Box King", dimensions: "193×203×60cm", color: "Bege", price: 3290 },
  { id: "6", name: "Escrivaninha Home Office", dimensions: "120×60×75cm", color: "Carvalho", price: 690 },
];

export default function VisualizadorAR() {
  const [selectedProduct, setSelectedProduct] = useState(arProducts[0]);
  const [arActive, setArActive] = useState(false);

  const startAR = () => {
    setArActive(true);
    toast.info("Modo AR ativado! Aponte a câmera para o chão do ambiente.", { duration: 4000 });
  };

  const shareAR = () => {
    const msg = `Veja como o ${selectedProduct.name} fica no seu ambiente! 🪑✨\nUse nosso visualizador AR: https://loja.com/ar/${selectedProduct.id}`;
    if (navigator.share) {
      navigator.share({ title: "Visualizador AR", text: msg }).catch(() => {});
    } else {
      navigator.clipboard.writeText(msg);
      toast.success("Link copiado para compartilhar!");
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Box className="w-6 h-6 text-primary" /> Visualizador AR
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Realidade aumentada: veja o móvel no ambiente do cliente antes de comprar</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* AR Viewport */}
        <Card className="overflow-hidden">
          <div className="relative bg-gradient-to-br from-muted/80 to-muted aspect-[4/3] flex items-center justify-center">
            {arActive ? (
              <div className="text-center space-y-4">
                <div className="w-48 h-32 border-2 border-dashed border-primary/40 rounded-xl mx-auto flex items-center justify-center bg-primary/5 animate-pulse">
                  <div className="text-center">
                    <Camera className="w-8 h-8 text-primary mx-auto mb-1" />
                    <p className="text-xs text-primary font-medium">Câmera AR Ativa</p>
                  </div>
                </div>
                <div className="bg-background/80 backdrop-blur p-3 rounded-xl inline-block">
                  <p className="text-sm font-semibold">{selectedProduct.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedProduct.dimensions} • {selectedProduct.color}</p>
                </div>
                <div className="flex items-center justify-center gap-3">
                  <Button variant="outline" size="sm"><RotateCw className="w-4 h-4 mr-1" /> Girar</Button>
                  <Button variant="outline" size="sm"><Move3d className="w-4 h-4 mr-1" /> Mover</Button>
                  <Button variant="outline" size="sm" onClick={shareAR}><Share2 className="w-4 h-4 mr-1" /> Compartilhar</Button>
                </div>
                <Button variant="destructive" size="sm" onClick={() => setArActive(false)}>Fechar AR</Button>
              </div>
            ) : (
              <div className="text-center space-y-4 p-6">
                <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                  <Smartphone className="w-10 h-10 text-primary" />
                </div>
                <h2 className="text-lg font-bold">Visualize no Ambiente Real</h2>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  Selecione um produto e ative o modo AR para ver como ele fica no espaço do seu cliente, em tamanho real.
                </p>
                <Button size="lg" onClick={startAR} className="gap-2">
                  <Camera className="w-5 h-5" /> Ativar Realidade Aumentada
                </Button>
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Info className="w-3.5 h-3.5" />
                  <span>Funciona melhor em dispositivos móveis com câmera</span>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Product selector */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Selecionar Produto</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {arProducts.map(p => (
                <button key={p.id} onClick={() => setSelectedProduct(p)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedProduct.id === p.id ? "border-primary bg-primary/5" : "border-border hover:bg-accent"}`}>
                  <p className="font-medium text-sm">{p.name}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-muted-foreground">{p.dimensions}</span>
                    <span className="text-sm font-bold text-primary">R$ {p.price.toLocaleString("pt-BR")}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] mt-1">{p.color}</Badge>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4 space-y-2">
              <h3 className="font-semibold text-sm">💡 Como usar o AR</h3>
              <ol className="text-xs text-muted-foreground space-y-1.5">
                <li>1. Selecione o produto desejado</li>
                <li>2. Clique em "Ativar Realidade Aumentada"</li>
                <li>3. Aponte a câmera para o chão do ambiente</li>
                <li>4. O móvel aparecerá em tamanho real</li>
                <li>5. Gire e mova para encontrar a posição ideal</li>
                <li>6. Compartilhe a visualização com o cliente</li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
