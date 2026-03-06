import { useState } from "react";
import { HelpCircle, Search, Store, ShoppingCart } from "lucide-react";
import { tutorials } from "@/data/tutorials";
import { TutorialCard } from "@/components/ajuda/TutorialCard";
import { useFurnitureMode } from "@/hooks/useFurnitureMode";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function Ajuda() {
  const [search, setSearch] = useState("");
  const [openSection, setOpenSection] = useState<string | null>(null);
  const { enabled: isFurnitureMode } = useFurnitureMode();

  // Default tab based on active mode
  const [tab, setTab] = useState<string>(isFurnitureMode ? "loja" : "pdv");

  const filterBySearch = (list: typeof tutorials) =>
    list.filter((t) =>
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase()) ||
      t.steps.some((s) => s.toLowerCase().includes(search.toLowerCase()))
    );

  const pdvTutorials = filterBySearch(tutorials.filter(t => !t.mode || t.mode === "pdv" || t.mode === "both"));
  const lojaTutorials = filterBySearch(tutorials.filter(t => t.mode === "loja" || t.mode === "both"));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <HelpCircle className="w-7 h-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Central de Ajuda</h1>
          <p className="text-sm text-muted-foreground">Tutoriais e guias de todas as funções do sistema</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-lg">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar tutorial... (ex: PDV, estoque, catálogo)"
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {/* Tabs: PDV vs Loja */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pdv" className="gap-1.5">
            <ShoppingCart className="w-4 h-4" /> PDV Geral
          </TabsTrigger>
          <TabsTrigger value="loja" className="gap-1.5">
            <Store className="w-4 h-4" /> Modo Loja
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pdv" className="mt-4 space-y-3">
          {pdvTutorials.length === 0 && (
            <div className="text-center py-16">
              <HelpCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-muted-foreground">Nenhum tutorial encontrado{search ? ` para "${search}"` : ""}.</p>
            </div>
          )}
          {pdvTutorials.map((section) => (
            <TutorialCard
              key={section.title}
              section={section}
              isOpen={openSection === section.title}
              onToggle={() => setOpenSection(openSection === section.title ? null : section.title)}
            />
          ))}
        </TabsContent>

        <TabsContent value="loja" className="mt-4 space-y-3">
          {lojaTutorials.length === 0 && (
            <div className="text-center py-16">
              <HelpCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-muted-foreground">Nenhum tutorial encontrado{search ? ` para "${search}"` : ""}.</p>
            </div>
          )}
          {lojaTutorials.map((section) => (
            <TutorialCard
              key={section.title}
              section={section}
              isOpen={openSection === section.title}
              onToggle={() => setOpenSection(openSection === section.title ? null : section.title)}
            />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
