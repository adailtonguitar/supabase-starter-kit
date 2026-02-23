import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Download, Smartphone, Monitor, Share, PlusSquare, MoreVertical, ArrowDown, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import logoAs from "@/assets/logo-as.png";

export default function Instalar() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">("desktop");

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) setPlatform("ios");
    else if (/android/.test(ua)) setPlatform("android");
    else setPlatform("desktop");

    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setIsInstalled(true);
    setDeferredPrompt(null);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>
        <div className="text-center space-y-3">
          <img src={logoAs} alt="Logo" className="w-16 h-16 mx-auto rounded-xl" />
          <h1 className="text-2xl font-bold text-foreground">Instalar Aplicativo</h1>
          <p className="text-muted-foreground text-sm">
            Instale o app no seu dispositivo para acesso rápido, mesmo offline.
          </p>
        </div>

        {isInstalled ? (
          <Card>
            <CardContent className="p-6 text-center space-y-2">
              <div className="w-12 h-12 bg-accent rounded-full flex items-center justify-center mx-auto">
                <Download className="w-6 h-6 text-accent-foreground" />
              </div>
              <h2 className="font-semibold text-foreground">App já instalado!</h2>
              <p className="text-sm text-muted-foreground">O aplicativo já está instalado no seu dispositivo.</p>
            </CardContent>
          </Card>
        ) : deferredPrompt ? (
          <Card>
            <CardContent className="p-6 text-center space-y-4">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                <Download className="w-6 h-6 text-primary" />
              </div>
              <h2 className="font-semibold text-foreground">Pronto para instalar</h2>
              <Button onClick={handleInstall} className="w-full" size="lg">
                <Download className="w-4 h-4 mr-2" /> Instalar agora
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {platform === "ios" && (
              <Card>
                <CardContent className="p-6 space-y-4">
                  <h2 className="font-semibold text-foreground flex items-center gap-2">
                    <Smartphone className="w-5 h-5" /> iPhone / iPad
                  </h2>
                  <ol className="space-y-3 text-sm text-muted-foreground">
                    <li className="flex items-start gap-3">
                      <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs shrink-0">1</span>
                      <span>Toque no botão <Share className="w-4 h-4 inline" /> <strong>Compartilhar</strong> na barra do Safari</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs shrink-0">2</span>
                      <span>Role para baixo e toque em <PlusSquare className="w-4 h-4 inline" /> <strong>Adicionar à Tela de Início</strong></span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs shrink-0">3</span>
                      <span>Toque em <strong>Adicionar</strong> para confirmar</span>
                    </li>
                  </ol>
                </CardContent>
              </Card>
            )}

            {platform === "android" && (
              <Card>
                <CardContent className="p-6 space-y-4">
                  <h2 className="font-semibold text-foreground flex items-center gap-2">
                    <Smartphone className="w-5 h-5" /> Android
                  </h2>
                  <ol className="space-y-3 text-sm text-muted-foreground">
                    <li className="flex items-start gap-3">
                      <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs shrink-0">1</span>
                      <span>Toque no menu <MoreVertical className="w-4 h-4 inline" /> do navegador (três pontos)</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs shrink-0">2</span>
                      <span>Toque em <strong>"Instalar app"</strong> ou <strong>"Adicionar à tela inicial"</strong></span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs shrink-0">3</span>
                      <span>Confirme tocando em <strong>Instalar</strong></span>
                    </li>
                  </ol>
                </CardContent>
              </Card>
            )}

            {platform === "desktop" && (
              <Card>
                <CardContent className="p-6 space-y-4">
                  <h2 className="font-semibold text-foreground flex items-center gap-2">
                    <Monitor className="w-5 h-5" /> Computador
                  </h2>
                  <ol className="space-y-3 text-sm text-muted-foreground">
                    <li className="flex items-start gap-3">
                      <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs shrink-0">1</span>
                      <span>Clique no ícone <ArrowDown className="w-4 h-4 inline" /> de instalação na barra de endereço do navegador</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs shrink-0">2</span>
                      <span>Clique em <strong>"Instalar"</strong> para confirmar</span>
                    </li>
                  </ol>
                  <p className="text-xs text-muted-foreground mt-2">
                    Funciona no Chrome, Edge e outros navegadores baseados em Chromium.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            O app instalado funciona offline e ocupa pouco espaço no dispositivo.
          </p>
        </div>
      </div>
    </div>
  );
}
