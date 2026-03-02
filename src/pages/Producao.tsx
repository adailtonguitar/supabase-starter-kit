import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";
import { ChefHat, Plus, Play, Trash2, Package, Scale, DollarSign, ClipboardList, CheckCircle, Clock, AlertTriangle, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface Product { id: string; name: string; cost_price: number | null; price: number; stock_quantity: number; unit: string; }
interface RecipeIngredient { product_id: string; product_name: string; quantity: number; unit: string; cost: number; }
interface Recipe { id: string; name: string; description: string | null; output_product_id: string | null; output_quantity: number; output_unit: string; category: string; is_active: boolean; ingredients: RecipeIngredient[]; }

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Producao() {
  const { user } = useAuth();
  const { companyId } = useCompany();
  const qc = useQueryClient();
  const [showRecipeDialog, setShowRecipeDialog] = useState(false);
  const [showProduceDialog, setShowProduceDialog] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [multiplier, setMultiplier] = useState(1);
  const [produceNotes, setProduceNotes] = useState("");
  const [recipeName, setRecipeName] = useState("");
  const [recipeDesc, setRecipeDesc] = useState("");
  const [outputProductId, setOutputProductId] = useState("");
  const [outputQty, setOutputQty] = useState(1);
  const [outputUnit, setOutputUnit] = useState("kg");
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [ingProductId, setIngProductId] = useState("");
  const [ingQty, setIngQty] = useState(1);

  const { data: products = [] } = useQuery({ queryKey: ["products-production", companyId], queryFn: async () => { if (!companyId) return []; const { data } = await supabase.from("products").select("id, name, cost_price, price, stock_quantity, unit").eq("company_id", companyId).eq("is_active", true).order("name"); return (data || []) as Product[]; }, enabled: !!companyId });

  const { data: recipes = [], isLoading: loadingRecipes } = useQuery({ queryKey: ["recipes", companyId], queryFn: async () => { if (!companyId) return []; const { data: recipeRows } = await supabase.from("recipes").select("*").eq("company_id", companyId).eq("is_active", true).order("name"); if (!recipeRows?.length) return []; const recipeIds = recipeRows.map((r: any) => r.id); const { data: ingRows } = await supabase.from("recipe_ingredients").select("*").in("recipe_id", recipeIds); return recipeRows.map((r: any) => { const ings = (ingRows || []).filter((i: any) => i.recipe_id === r.id).map((i: any) => { const prod = products.find((p) => p.id === i.product_id); return { product_id: i.product_id, product_name: prod?.name || "Produto removido", quantity: Number(i.quantity), unit: i.unit, cost: (prod?.cost_price || 0) * Number(i.quantity) }; }); return { id: r.id, name: r.name, description: r.description || null, output_product_id: r.output_product_id || null, output_quantity: Number(r.output_quantity || 1), output_unit: r.output_unit || "un", category: r.category || "", is_active: r.is_active, ingredients: ings } as Recipe; }); }, enabled: !!companyId && products.length > 0 });

  const { data: orders = [], isLoading: loadingOrders } = useQuery({ queryKey: ["production-orders", companyId], queryFn: async () => { if (!companyId) return []; const { data } = await supabase.from("production_orders").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(50); return data || []; }, enabled: !!companyId });

  const saveRecipeMut = useMutation({
    mutationFn: async () => {
      if (!companyId || !user) throw new Error("Sem empresa");
      if (!recipeName.trim()) throw new Error("Nome obrigatório");
      if (ingredients.length === 0) throw new Error("Adicione pelo menos 1 ingrediente");
      const productId = outputProductId || ingredients[0]?.product_id;
      if (!productId) throw new Error("Selecione um produto de saída ou adicione ingredientes");
      const { data: recipe, error } = await supabase.from("recipes").insert({ company_id: companyId, name: recipeName.trim(), product_id: productId }).select().single();
      if (error) throw error;
      const ingInserts = ingredients.map((i) => ({ recipe_id: recipe.id, product_id: i.product_id, quantity: i.quantity, unit: i.unit, company_id: companyId }));
      const { error: ingErr } = await supabase.from("recipe_ingredients").insert(ingInserts);
      if (ingErr) throw ingErr;
      return recipe;
    },
    onSuccess: () => { toast.success("Receita criada com sucesso!"); qc.invalidateQueries({ queryKey: ["recipes"] }); resetRecipeForm(); setShowRecipeDialog(false); },
    onError: (e: any) => toast.error(e.message),
  });

  const produceMut = useMutation({
    mutationFn: async () => {
      if (!companyId || !user || !selectedRecipe) throw new Error("Dados inválidos");
      const totalCost = selectedRecipe.ingredients.reduce((s, i) => s + i.cost * multiplier, 0);
      for (const ing of selectedRecipe.ingredients) { const prod = products.find((p) => p.id === ing.product_id); const needed = ing.quantity * multiplier; if (prod && prod.stock_quantity < needed) throw new Error(`Estoque insuficiente de "${prod.name}": precisa ${needed} ${ing.unit}, tem ${prod.stock_quantity}`); }
      const { data: order, error } = await supabase.from("production_orders").insert({ company_id: companyId, recipe_id: selectedRecipe.id, recipe_name: selectedRecipe.name, multiplier, status: "concluido", total_cost: totalCost, output_quantity: selectedRecipe.output_quantity * multiplier, output_unit: selectedRecipe.output_unit, output_product_id: selectedRecipe.output_product_id, notes: produceNotes || null, produced_by: user.id, produced_at: new Date().toISOString() }).select().single();
      if (error) throw error;
      const items = selectedRecipe.ingredients.map((i) => ({ production_order_id: order.id, product_id: i.product_id, product_name: i.product_name, quantity_required: i.quantity * multiplier, unit_cost: i.cost / i.quantity, total_cost: i.cost * multiplier, unit: i.unit, company_id: companyId }));
      await supabase.from("production_order_items").insert(items);
      for (const ing of selectedRecipe.ingredients) { const prod = products.find((p) => p.id === ing.product_id); if (prod) { await supabase.from("products").update({ stock_quantity: prod.stock_quantity - ing.quantity * multiplier }).eq("id", prod.id); } }
      if (selectedRecipe.output_product_id) { const outProd = products.find((p) => p.id === selectedRecipe.output_product_id); if (outProd) { await supabase.from("products").update({ stock_quantity: outProd.stock_quantity + selectedRecipe.output_quantity * multiplier }).eq("id", outProd.id); } }
      return order;
    },
    onSuccess: () => { toast.success("Produção realizada! Estoque atualizado."); qc.invalidateQueries({ queryKey: ["production-orders"] }); qc.invalidateQueries({ queryKey: ["products-production"] }); setShowProduceDialog(false); setSelectedRecipe(null); setMultiplier(1); setProduceNotes(""); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteRecipeMut = useMutation({ mutationFn: async (id: string) => { await supabase.from("recipes").update({ is_active: false }).eq("id", id); }, onSuccess: () => { toast.success("Receita removida"); qc.invalidateQueries({ queryKey: ["recipes"] }); } });

  function resetRecipeForm() { setRecipeName(""); setRecipeDesc(""); setOutputProductId(""); setOutputQty(1); setOutputUnit("kg"); setIngredients([]); setIngProductId(""); setIngQty(1); }

  function addIngredient() {
    if (!ingProductId) return;
    if (ingredients.some((i) => i.product_id === ingProductId)) { toast.error("Ingrediente já adicionado"); return; }
    const prod = products.find((p) => p.id === ingProductId);
    if (!prod) return;
    setIngredients((prev) => [...prev, { product_id: prod.id, product_name: prod.name, quantity: ingQty, unit: prod.unit || "un", cost: (prod.cost_price || 0) * ingQty }]);
    setIngProductId(""); setIngQty(1);
  }

  function openProduce(recipe: Recipe) { setSelectedRecipe(recipe); setMultiplier(1); setProduceNotes(""); setShowProduceDialog(true); }

  const totalRecipeCost = ingredients.reduce((s, i) => s + i.cost, 0);
  const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = { pendente: { label: "Pendente", variant: "secondary" }, concluido: { label: "Concluído", variant: "default" }, cancelado: { label: "Cancelado", variant: "destructive" } };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div><h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2"><ChefHat className="w-6 h-6" /> Produção</h1><p className="text-sm text-muted-foreground mt-1">Gerencie receitas e ordens de produção para açougue e padaria</p></div>
        <Button className="shrink-0" onClick={() => { resetRecipeForm(); setShowRecipeDialog(true); }}><Plus className="w-4 h-4 mr-1" /> Nova Receita</Button>
      </div>

      <Tabs defaultValue="recipes">
        <TabsList>
          <TabsTrigger value="recipes"><ClipboardList className="w-4 h-4 mr-1" /> Receitas ({recipes.length})</TabsTrigger>
          <TabsTrigger value="orders"><Clock className="w-4 h-4 mr-1" /> Histórico ({orders.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="recipes" className="space-y-4 mt-4">
          {recipes.length === 0 && !loadingRecipes && (<Card className="border-dashed"><CardContent className="py-12 text-center text-muted-foreground"><ChefHat className="w-12 h-12 mx-auto mb-3 opacity-40" /><p className="font-medium">Nenhuma receita cadastrada</p><p className="text-sm mt-1">Crie sua primeira receita para começar a produzir</p></CardContent></Card>)}
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {recipes.map((recipe) => {
              const cost = recipe.ingredients.reduce((s, i) => s + i.cost, 0);
              return (
                <motion.div key={recipe.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  <Card className="hover:border-primary/30 transition-colors">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between"><CardTitle className="text-base">{recipe.name}</CardTitle><div className="flex gap-1"><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openProduce(recipe)}><Play className="w-3.5 h-3.5 text-success" /></Button><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteRecipeMut.mutate(recipe.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button></div></div>
                      {recipe.description && <p className="text-xs text-muted-foreground">{recipe.description}</p>}
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-4 text-sm"><div className="flex items-center gap-1 text-muted-foreground"><Scale className="w-3.5 h-3.5" /><span>Rende: {recipe.output_quantity} {recipe.output_unit}</span></div><div className="flex items-center gap-1 font-medium text-foreground"><DollarSign className="w-3.5 h-3.5" /><span>{fmt(cost)}</span></div></div>
                      <Separator />
                      <div className="space-y-1"><p className="text-xs font-medium text-muted-foreground">Ingredientes ({recipe.ingredients.length})</p>{recipe.ingredients.map((ing) => (<div key={ing.product_id} className="flex justify-between text-xs"><span className="text-foreground">{ing.product_name}</span><span className="text-muted-foreground">{ing.quantity} {ing.unit}</span></div>))}</div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </TabsContent>
        <TabsContent value="orders" className="space-y-3 mt-4">
          {orders.length === 0 && !loadingOrders && (<Card className="border-dashed"><CardContent className="py-12 text-center text-muted-foreground"><Clock className="w-12 h-12 mx-auto mb-3 opacity-40" /><p className="font-medium">Nenhuma produção realizada</p></CardContent></Card>)}
          {orders.map((order: any) => { const st = statusConfig[order.status] || statusConfig.pendente; return (<Card key={order.id}><CardContent className="py-3 flex items-center justify-between"><div><p className="font-medium text-foreground">{order.recipe_name}</p><p className="text-xs text-muted-foreground">{order.output_quantity} {order.output_unit} • Multiplicador: {order.multiplier}x{order.produced_at && ` • ${new Date(order.produced_at).toLocaleString("pt-BR")}`}</p></div><div className="flex items-center gap-3"><span className="text-sm font-semibold text-foreground">{fmt(Number(order.total_cost))}</span><Badge variant={st.variant}>{st.label}</Badge></div></CardContent></Card>); })}
        </TabsContent>
      </Tabs>

      <Dialog open={showRecipeDialog} onOpenChange={setShowRecipeDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nova Receita</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nome da receita *</Label><Input value={recipeName} onChange={(e) => setRecipeName(e.target.value)} placeholder="Ex: Pão Francês" /></div>
            <div><Label>Descrição</Label><Textarea value={recipeDesc} onChange={(e) => setRecipeDesc(e.target.value)} placeholder="Detalhes da receita..." rows={2} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Qtd. produzida</Label><Input type="number" min={0.01} step={0.01} value={outputQty} onChange={(e) => setOutputQty(Number(e.target.value))} /></div>
              <div><Label>Unidade</Label><Select value={outputUnit} onValueChange={setOutputUnit}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="kg">kg</SelectItem><SelectItem value="un">un</SelectItem><SelectItem value="lt">lt</SelectItem><SelectItem value="pct">pct</SelectItem></SelectContent></Select></div>
              <div><Label>Produto saída</Label><Select value={outputProductId} onValueChange={setOutputProductId}><SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger><SelectContent>{products.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}</SelectContent></Select></div>
            </div>
            <Separator />
            <div>
              <Label className="mb-2 block">Ingredientes</Label>
              <div className="flex gap-2">
                <Select value={ingProductId} onValueChange={setIngProductId}><SelectTrigger className="flex-1"><SelectValue placeholder="Selecione o produto" /></SelectTrigger><SelectContent>{products.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name} ({p.unit})</SelectItem>))}</SelectContent></Select>
                <Input type="number" min={0.01} step={0.01} value={ingQty} onChange={(e) => setIngQty(Number(e.target.value))} className="w-20" />
                <Button variant="outline" size="icon" onClick={addIngredient}><Plus className="w-4 h-4" /></Button>
              </div>
              <div className="mt-3 space-y-1">
                {ingredients.map((ing, idx) => (<div key={ing.product_id} className="flex items-center justify-between text-sm bg-muted/30 rounded px-3 py-1.5"><div className="flex items-center gap-2"><Package className="w-3.5 h-3.5 text-muted-foreground" /><span>{ing.product_name}</span></div><div className="flex items-center gap-3"><span className="text-muted-foreground">{ing.quantity} {ing.unit}</span><span className="text-xs">{fmt(ing.cost)}</span><Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setIngredients((prev) => prev.filter((_, i) => i !== idx))}><X className="w-3 h-3" /></Button></div></div>))}
              </div>
              {ingredients.length > 0 && <div className="mt-2 text-right text-sm font-semibold text-foreground">Custo total: {fmt(totalRecipeCost)}</div>}
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowRecipeDialog(false)}>Cancelar</Button><Button onClick={() => saveRecipeMut.mutate()} disabled={saveRecipeMut.isPending}>{saveRecipeMut.isPending ? "Salvando..." : "Salvar Receita"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showProduceDialog} onOpenChange={setShowProduceDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Play className="w-5 h-5 text-success" /> Executar Produção</DialogTitle></DialogHeader>
          {selectedRecipe && (
            <div className="space-y-4">
              <div><p className="font-medium text-foreground">{selectedRecipe.name}</p><p className="text-sm text-muted-foreground">Rende {selectedRecipe.output_quantity} {selectedRecipe.output_unit} por lote</p></div>
              <div><Label>Multiplicador (lotes)</Label><Input type="number" min={1} step={1} value={multiplier} onChange={(e) => setMultiplier(Math.max(1, Number(e.target.value)))} /><p className="text-xs text-muted-foreground mt-1">Produção total: {(selectedRecipe.output_quantity * multiplier).toFixed(2)} {selectedRecipe.output_unit}</p></div>
              <Separator />
              <div className="space-y-1"><p className="text-xs font-medium text-muted-foreground">Ingredientes necessários</p>{selectedRecipe.ingredients.map((ing) => { const prod = products.find((p) => p.id === ing.product_id); const needed = ing.quantity * multiplier; const hasStock = prod ? prod.stock_quantity >= needed : false; return (<div key={ing.product_id} className="flex items-center justify-between text-sm"><span className="text-foreground">{ing.product_name}</span><div className="flex items-center gap-2"><span className="text-muted-foreground">{needed.toFixed(2)} {ing.unit}</span>{hasStock ? <CheckCircle className="w-3.5 h-3.5 text-success" /> : <AlertTriangle className="w-3.5 h-3.5 text-destructive" />}</div></div>); })}</div>
              <div className="text-right font-semibold text-foreground">Custo estimado: {fmt(selectedRecipe.ingredients.reduce((s, i) => s + i.cost * multiplier, 0))}</div>
              <div><Label>Observações</Label><Textarea value={produceNotes} onChange={(e) => setProduceNotes(e.target.value)} rows={2} /></div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setShowProduceDialog(false)}>Cancelar</Button><Button onClick={() => produceMut.mutate()} disabled={produceMut.isPending} className="bg-success hover:bg-success/90 text-success-foreground">{produceMut.isPending ? "Produzindo..." : "Confirmar Produção"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
