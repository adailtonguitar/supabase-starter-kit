import { useState } from "react";
import { usePromotions } from "@/hooks/usePromotions";
import { useProducts } from "@/hooks/useProducts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Tag, Percent, ShoppingCart, DollarSign, Calendar } from "lucide-react";
import { toast } from "sonner";

const PROMO_TYPE_LABELS: Record<string, string> = {
  percentual: "Desconto %",
  leve_x_pague_y: "Leve X Pague Y",
  preco_fixo: "Preço Fixo",
};

const PROMO_TYPE_ICONS: Record<string, any> = {
  percentual: Percent,
  leve_x_pague_y: ShoppingCart,
  preco_fixo: DollarSign,
};

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function Promocoes() {
  const { promotions, loading, createPromotion, togglePromotion, deletePromotion } = usePromotions();
  const { data: products = [] } = useProducts();
  const [open, setOpen] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [promoType, setPromoType] = useState("percentual");
  const [discountPercent, setDiscountPercent] = useState(0);
  const [fixedPrice, setFixedPrice] = useState(0);
  const [buyQty, setBuyQty] = useState(3);
  const [payQty, setPayQty] = useState(2);
  const [scope, setScope] = useState("product");
  const [categoryName, setCategoryName] = useState("");
  const [minQty, setMinQty] = useState(1);
  const [startsAt, setStartsAt] = useState(new Date().toISOString().split("T")[0]);
  const [endsAt, setEndsAt] = useState("");
  const [activeDays, setActiveDays] = useState<number[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setName("");
    setDescription("");
    setPromoType("percentual");
    setDiscountPercent(0);
    setFixedPrice(0);
    setBuyQty(3);
    setPayQty(2);
    setScope("product");
    setCategoryName("");
    setMinQty(1);
    setStartsAt(new Date().toISOString().split("T")[0]);
    setEndsAt("");
    setActiveDays([]);
    setSelectedProducts([]);
    setProductSearch("");
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.warning("Informe o nome da promoção");
      return;
    }
    if (scope === "product" && selectedProducts.length === 0) {
      toast.warning("Selecione ao menos um produto");
      return;
    }
    if (scope === "category" && !categoryName.trim()) {
      toast.warning("Informe a categoria");
      return;
    }

    setSaving(true);
    try {
      await createPromotion({
        name: name.trim(),
        description: description.trim() || undefined,
        promo_type: promoType,
        discount_percent: promoType === "percentual" ? discountPercent : 0,
        fixed_price: promoType === "preco_fixo" ? fixedPrice : 0,
        buy_quantity: promoType === "leve_x_pague_y" ? buyQty : 0,
        pay_quantity: promoType === "leve_x_pague_y" ? payQty : 0,
        scope,
        category_name: scope === "category" ? categoryName : undefined,
        min_quantity: minQty,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: endsAt ? new Date(endsAt).toISOString() : undefined,
        // active_days not in DB schema — stored locally only
        product_ids: scope === "product" ? selectedProducts : undefined,
      });
      setOpen(false);
      resetForm();
    } catch {
      // error already toasted
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.sku && p.sku.toLowerCase().includes(productSearch.toLowerCase()))
  ).slice(0, 20);

  const uniqueCategories = [...new Set(products.map((p) => p.category).filter((c): c is string => !!c))];

  const toggleDay = (day: number) => {
    setActiveDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const toggleProduct = (id: string) => {
    setSelectedProducts((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Promoções</h1>
          <p className="text-muted-foreground">Gerencie ofertas e descontos automáticos no PDV</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />Nova Promoção</Button>
          </DialogTrigger>
           <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Criar Promoção</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 overflow-y-auto flex-1 pr-1">
              <div>
                <Label>Nome da promoção</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: 10% em Laticínios" />
              </div>
              <div>
                <Label>Descrição (opcional)</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalhes da oferta..." rows={2} />
              </div>

              <div>
                <Label>Tipo de promoção</Label>
                <Select value={promoType} onValueChange={setPromoType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentual">Desconto percentual (%)</SelectItem>
                    <SelectItem value="leve_x_pague_y">Leve X Pague Y</SelectItem>
                    <SelectItem value="preco_fixo">Preço fixo promocional</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {promoType === "percentual" && (
                <div>
                  <Label>Desconto (%)</Label>
                  <Input type="number" min={1} max={100} value={discountPercent} onChange={(e) => setDiscountPercent(Number(e.target.value))} />
                </div>
              )}

              {promoType === "preco_fixo" && (
                <div>
                  <Label>Preço promocional (R$)</Label>
                  <Input type="number" min={0.01} step={0.01} value={fixedPrice} onChange={(e) => setFixedPrice(Number(e.target.value))} />
                </div>
              )}

              {promoType === "leve_x_pague_y" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Leve (quantidade)</Label>
                    <Input type="number" min={2} value={buyQty} onChange={(e) => setBuyQty(Number(e.target.value))} />
                  </div>
                  <div>
                    <Label>Pague (quantidade)</Label>
                    <Input type="number" min={1} value={payQty} onChange={(e) => setPayQty(Number(e.target.value))} />
                  </div>
                </div>
              )}

              <div>
                <Label>Aplicar em</Label>
                <Select value={scope} onValueChange={setScope}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="product">Produtos específicos</SelectItem>
                    <SelectItem value="category">Categoria inteira</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {scope === "category" && (
                <div>
                  <Label>Categoria</Label>
                  <Select value={categoryName} onValueChange={setCategoryName}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {uniqueCategories.map((c) => (
                        <SelectItem key={c} value={c!}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {scope === "product" && (
                <div>
                  <Label>Produtos ({selectedProducts.length} selecionados)</Label>
                  <Input
                    placeholder="Buscar produto..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="mb-2"
                  />
                  <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
                    {filteredProducts.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted p-1 rounded">
                        <input
                          type="checkbox"
                          checked={selectedProducts.includes(p.id)}
                          onChange={() => toggleProduct(p.id)}
                          className="rounded"
                        />
                        <span className="truncate">{p.name}</span>
                        <span className="text-muted-foreground ml-auto text-xs">R$ {Number(p.price).toFixed(2)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {promoType !== "leve_x_pague_y" && (
                <div>
                  <Label>Quantidade mínima</Label>
                  <Input type="number" min={1} value={minQty} onChange={(e) => setMinQty(Number(e.target.value))} />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Início</Label>
                  <Input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
                </div>
                <div>
                  <Label>Fim (opcional)</Label>
                  <Input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
                </div>
              </div>

              <div>
                <Label>Dias da semana (vazio = todos)</Label>
                <div className="flex gap-1 mt-1">
                  {DAY_LABELS.map((label, i) => (
                    <Button
                      key={i}
                      type="button"
                      size="sm"
                      variant={activeDays.includes(i) ? "default" : "outline"}
                      className="text-xs px-2"
                      onClick={() => toggleDay(i)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              <Button onClick={handleCreate} disabled={saving} className="w-full">
                {saving ? "Criando..." : "Criar Promoção"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : promotions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Tag className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhuma promoção cadastrada</p>
            <p className="text-sm">Crie sua primeira promoção para aplicar descontos automáticos no PDV.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {promotions.map((promo) => {
            const Icon = PROMO_TYPE_ICONS[promo.promo_type] || Tag;
            const isExpired = promo.ends_at && new Date(promo.ends_at) < new Date();
            return (
              <Card key={promo.id} className={!promo.is_active || isExpired ? "opacity-60" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-sm">{promo.name}</CardTitle>
                        <Badge variant="secondary" className="text-xs mt-0.5">
                          {PROMO_TYPE_LABELS[promo.promo_type]}
                        </Badge>
                      </div>
                    </div>
                    <Switch
                      checked={promo.is_active}
                      onCheckedChange={(v) => togglePromotion(promo.id, v)}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {promo.promo_type === "percentual" && (
                    <p className="text-lg font-bold text-primary">{promo.discount_percent}% OFF</p>
                  )}
                  {promo.promo_type === "preco_fixo" && (
                    <p className="text-lg font-bold text-primary">R$ {Number(promo.fixed_price).toFixed(2)}</p>
                  )}
                  {promo.promo_type === "leve_x_pague_y" && (
                    <p className="text-lg font-bold text-primary">Leve {promo.buy_quantity} Pague {promo.pay_quantity}</p>
                  )}

                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <p>
                      {promo.scope === "category"
                        ? `Categoria: ${promo.category_name}`
                        : `${promo.product_ids?.length || 0} produto(s)`}
                    </p>
                    <p className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(promo.starts_at).toLocaleDateString("pt-BR")}
                      {promo.ends_at && ` — ${new Date(promo.ends_at).toLocaleDateString("pt-BR")}`}
                    </p>
                    {promo.active_days && promo.active_days.length > 0 && (
                      <p>{promo.active_days.map((d) => DAY_LABELS[d]).join(", ")}</p>
                    )}
                    {isExpired && <Badge variant="destructive" className="text-xs">Expirada</Badge>}
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive text-xs"
                    onClick={() => deletePromotion(promo.id)}
                  >
                    <Trash2 className="w-3 h-3 mr-1" />Excluir
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}