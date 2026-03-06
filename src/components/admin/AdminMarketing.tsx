import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Download, Image, Eye, Copy } from "lucide-react";

interface ArtAsset {
  id: string;
  name: string;
  format: string;
  dimensions: string;
  url: string;
  category: string;
}

const existingArts: ArtAsset[] = [
  // Screenshots reais do sistema
  {
    id: "screenshot-pdv",
    name: "PDV — Tela de Vendas",
    format: "Screenshot",
    dimensions: "1920×1080",
    url: "/marketing/screenshot-pdv.png",
    category: "screenshot",
  },
  {
    id: "screenshot-pdv-tela",
    name: "PDV — Interface Completa",
    format: "Screenshot",
    dimensions: "1920×1080",
    url: "/marketing/screenshot-pdv-tela.png",
    category: "screenshot",
  },
  {
    id: "screenshot-pdv-composicao",
    name: "PDV — Composição Visual",
    format: "Screenshot",
    dimensions: "1920×1080",
    url: "/marketing/screenshot-pdv-composicao.png",
    category: "screenshot",
  },
  {
    id: "screenshot-dashboard",
    name: "Dashboard — Painel Principal",
    format: "Screenshot",
    dimensions: "1920×1080",
    url: "/marketing/screenshot-dashboard.png",
    category: "screenshot",
  },
  {
    id: "screenshot-financeiro",
    name: "Financeiro — Gestão Completa",
    format: "Screenshot",
    dimensions: "1920×1080",
    url: "/marketing/screenshot-financeiro.png",
    category: "screenshot",
  },
  {
    id: "screenshot-mobile",
    name: "Mobile — Mockup Responsivo",
    format: "Screenshot",
    dimensions: "Mobile",
    url: "/marketing/screenshot-mobile.png",
    category: "screenshot",
  },
  // Artes promocionais
  {
    id: "feed-1",
    name: "Feed Instagram — Gestão Completa",
    format: "Feed Instagram",
    dimensions: "1080×1080",
    url: "/marketing/feed-instagram-1080x1080.png",
    category: "arte",
  },
  {
    id: "stories-1",
    name: "Stories — PDV + Estoque + Fiscal",
    format: "Stories",
    dimensions: "1080×1920",
    url: "/marketing/stories-1080x1920.png",
    category: "arte",
  },
  {
    id: "banner-1",
    name: "Banner Facebook — Sistema Completo",
    format: "Banner Facebook",
    dimensions: "1920×1080",
    url: "/marketing/banner-facebook-1920x1080.png",
    category: "arte",
  },
];


export function AdminMarketing() {
  const [selectedFormat, setSelectedFormat] = useState("feed");
  const [selectedTheme, setSelectedTheme] = useState("pdv");
  const [customPrompt, setCustomPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [previewArt, setPreviewArt] = useState<ArtAsset | null>(null);
  const [filter, setFilter] = useState("all");

  const handleDownload = (url: string, name: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    toast.success("Download iniciado!");
  };

  const handleCopyLink = (url: string) => {
    const fullUrl = window.location.origin + url;
    navigator.clipboard.writeText(fullUrl);
    toast.success("Link copiado!");
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setGeneratedImage(null);
    try {
      const format = formatOptions.find((f) => f.id === selectedFormat)!;
      const theme = aiPromptTemplates.find((t) => t.id === selectedTheme);
      const prompt = customPrompt.trim() || theme?.prompt || "Promotional art for AnthoSystem retail management system";

      console.log("[AdminMarketing] Calling generate-marketing-art...");
      
      // Use fetch directly to capture error response body
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://fsvxpxziotklbxkivyug.supabase.co";
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzdnhweHppb3RrbGJ4a2l2eXVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODU5NTMsImV4cCI6MjA4NzM2MTk1M30.8I3ABsRZBZuE1IpK_g9z3PdRUd9Omt_F5qNx0Pgqvyo";
      
      const resp = await fetch(`${supabaseUrl}/functions/v1/generate-marketing-art`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseKey}`,
          "apikey": supabaseKey,
        },
        body: JSON.stringify({ prompt, width: format.width, height: format.height }),
      });

      const result = await resp.json();
      console.log("[AdminMarketing] Status:", resp.status, "Response:", JSON.stringify(result).substring(0, 500));

      if (!resp.ok || result.error) {
        throw new Error(result.error || `Erro ${resp.status}`);
      }

      if (result?.image) {
        setGeneratedImage(result.image);
        toast.success("Arte gerada com sucesso!");
      } else {
        throw new Error("Nenhuma imagem retornada pelo modelo");
      }
    } catch (err: any) {
      console.error("[AdminMarketing] Generate error:", err);
      toast.error(err.message || "Erro ao gerar arte");
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadGenerated = () => {
    if (!generatedImage) return;
    const format = formatOptions.find((f) => f.id === selectedFormat)!;
    const theme = aiPromptTemplates.find((t) => t.id === selectedTheme);
    const a = document.createElement("a");
    a.href = generatedImage;
    a.download = `anthosystem-${theme?.id || "custom"}-${format.id}.png`;
    a.click();
    toast.success("Download iniciado!");
  };

  const filteredArts = filter === "all" ? existingArts : existingArts.filter((a) => a.category === filter);

  return (
    <div className="space-y-6">
      {/* Gallery Section */}
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Image className="h-4 w-4 text-primary" />
              Galeria de Marketing
            </CardTitle>
            <div className="flex gap-1.5">
              {[
                { value: "all", label: "Tudo" },
                { value: "screenshot", label: "Screenshots" },
                { value: "arte", label: "Artes" },
              ].map((f) => (
                <Button
                  key={f.value}
                  size="sm"
                  variant={filter === f.value ? "default" : "outline"}
                  className="h-7 text-xs px-3"
                  onClick={() => setFilter(f.value)}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredArts.map((art) => (
              <div
                key={art.id}
                className="group rounded-xl border border-border bg-card overflow-hidden hover:border-primary/30 hover:shadow-lg transition-all"
              >
                <div className="relative aspect-video bg-muted overflow-hidden">
                  <img
                    src={art.url}
                    alt={art.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 text-xs"
                      onClick={() => setPreviewArt(art)}
                    >
                      <Eye className="w-3.5 h-3.5 mr-1" /> Ver
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => handleDownload(art.url, `${art.id}.png`)}
                    >
                      <Download className="w-3.5 h-3.5 mr-1" /> Baixar
                    </Button>
                  </div>
                </div>
                <div className="p-3 space-y-2">
                  <p className="text-sm font-medium truncate">{art.name}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1.5">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{art.format}</Badge>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{art.dimensions}</Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => handleCopyLink(art.url)}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* AI Generator Section */}
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Sparkles className="h-4 w-4 text-primary" />
            Gerador de Artes com IA
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0 space-y-4">
          <p className="text-sm text-muted-foreground">
            Gere artes promocionais automaticamente usando IA. Escolha o tema, formato e clique em gerar.
          </p>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Formato</label>
              <Select value={selectedFormat} onValueChange={setSelectedFormat}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {formatOptions.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Tema</label>
              <Select value={selectedTheme} onValueChange={setSelectedTheme}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {aiPromptTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Prompt personalizado (opcional)</label>
            <Input
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Descreva a arte que deseja gerar... (deixe vazio para usar o tema selecionado)"
            />
          </div>

          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="gap-2"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Gerando arte...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" /> Gerar Arte com IA
              </>
            )}
          </Button>

          {/* Generated Result */}
          {generatedImage && (
            <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-primary">Arte gerada!</p>
                <Button size="sm" onClick={handleDownloadGenerated} className="gap-1.5">
                  <Download className="w-3.5 h-3.5" /> Baixar
                </Button>
              </div>
              <div className="rounded-lg overflow-hidden border border-border">
                <img
                  src={generatedImage}
                  alt="Arte gerada por IA"
                  className="w-full max-h-[500px] object-contain bg-muted"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Full Preview Modal */}
      {previewArt && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewArt(null)}
        >
          <div className="max-w-4xl w-full space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-bold">{previewArt.name}</p>
                <p className="text-white/60 text-sm">{previewArt.format} — {previewArt.dimensions}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => handleCopyLink(previewArt.url)} className="gap-1.5">
                  <Copy className="w-3.5 h-3.5" /> Copiar Link
                </Button>
                <Button size="sm" onClick={() => handleDownload(previewArt.url, `${previewArt.id}.png`)} className="gap-1.5">
                  <Download className="w-3.5 h-3.5" /> Baixar
                </Button>
                <Button size="sm" variant="ghost" className="text-white" onClick={() => setPreviewArt(null)}>
                  ✕
                </Button>
              </div>
            </div>
            <div className="rounded-xl overflow-hidden border border-white/10">
              <img src={previewArt.url} alt={previewArt.name} className="w-full object-contain max-h-[80vh]" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
