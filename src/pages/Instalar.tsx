import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Download, Smartphone, Monitor, Share, PlusSquare, MoreVertical, ArrowDown, ArrowLeft, Chrome, Globe, Apple } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    <div className="min-h-screen bg-background flex items-start justify-center p-4 sm:p-8">
      <div className="max-w-2xl w-full space-y-8">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>

        <div className="text-center space-y-3">
          <img src={logoAs} alt="Logo" className="w-20 h-20 mx-auto rounded-2xl shadow-lg" />
          <h1 className="text-3xl font-bold text-foreground">Instalar Aplicativo</h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            Instale o app no seu dispositivo para acesso rápido, mesmo offline. Funciona como um aplicativo nativo!
          </p>
        </div>

        {isInstalled ? (
          <Card>
            <CardContent className="p-8 text-center space-y-3">
              <div className="w-14 h-14 bg-accent rounded-full flex items-center justify-center mx-auto">
                <Download className="w-7 h-7 text-accent-foreground" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">App já instalado!</h2>
              <p className="text-sm text-muted-foreground">O aplicativo já está instalado no seu dispositivo.</p>
            </CardContent>
          </Card>
        ) : deferredPrompt ? (
          <Card>
            <CardContent className="p-8 text-center space-y-5">
              <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                <Download className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Pronto para instalar</h2>
              <p className="text-sm text-muted-foreground">Clique no botão abaixo para instalar o app diretamente.</p>
              <Button onClick={handleInstall} className="w-full" size="lg">
                <Download className="w-4 h-4 mr-2" /> Instalar agora
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {/* Tutorials for all platforms */}
        <Tabs defaultValue={platform} className="w-full">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="android" className="gap-1.5">
              <Smartphone className="w-4 h-4" /> Android
            </TabsTrigger>
            <TabsTrigger value="ios" className="gap-1.5">
              <Apple className="w-4 h-4" /> iOS
            </TabsTrigger>
            <TabsTrigger value="desktop" className="gap-1.5">
              <Monitor className="w-4 h-4" /> Computador
            </TabsTrigger>
          </TabsList>

          <TabsContent value="android">
            <Card>
              <CardContent className="p-6 space-y-5">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
                     <Smartphone className="w-5 h-5 text-success" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-foreground">Android</h2>
                    <p className="text-xs text-muted-foreground">Chrome, Samsung Internet, Edge</p>
                  </div>
                </div>

                <div className="space-y-1">
                  <h3 className="text-sm font-medium text-foreground">Via Google Chrome</h3>
                  <ol className="space-y-3 text-sm text-muted-foreground mt-2">
                    <li className="flex items-start gap-3">
                      <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs shrink-0 mt-0.5">1</span>
                      <span>Abra o site no <strong>Google Chrome</strong></span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs shrink-0 mt-0.5">2</span>
                      <span>Toque no menu <MoreVertical className="w-4 h-4 inline align-text-bottom" /> (três pontos no canto superior direito)</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs shrink-0 mt-0.5">3</span>
                      <span>Toque em <strong>"Instalar app"</strong> ou <strong>"Adicionar à tela inicial"</strong></span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs shrink-0 mt-0.5">4</span>
                      <span>Confirme tocando em <strong>"Instalar"</strong></span>
                    </li>
                  </ol>
                </div>

                <div className="border-t border-border pt-4 space-y-1">
                  <h3 className="text-sm font-medium text-foreground">Via Samsung Internet</h3>
                  <ol className="space-y-3 text-sm text-muted-foreground mt-2">
                    <li className="flex items-start gap-3">
                      <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs shrink-0 mt-0.5">1</span>
                      <span>Abra o site no <strong>Samsung Internet</strong></span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs shrink-0 mt-0.5">2</span>
                      <span>Toque no menu <strong>☰</strong> (canto inferior direito)</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs shrink-0 mt-0.5">3</span>
                      <span>Toque em <strong>"Adicionar página a"</strong> → <strong>"Tela inicial"</strong></span>
                    </li>
                  </ol>
                </div>

                <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
                  💡 <strong>Dica:</strong> Se o banner de instalação aparecer automaticamente na parte inferior da tela, basta tocar nele para instalar mais rapidamente.
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ios">
            <Card>
              <CardContent className="p-6 space-y-5">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-xl bg-info/10 flex items-center justify-center shrink-0">
                     <Apple className="w-5 h-5 text-info" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-foreground">iPhone / iPad</h2>
                    <p className="text-xs text-muted-foreground">Safari (obrigatório no iOS)</p>
                  </div>
                </div>

                <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 text-xs text-warning">
                  ⚠️ <strong>Importante:</strong> No iOS, a instalação de apps PWA funciona <strong>apenas pelo Safari</strong>. Outros navegadores (Chrome, Firefox) não suportam essa funcionalidade no iOS.
                </div>

                <ol className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex items-start gap-3">
                    <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs shrink-0 mt-0.5">1</span>
                    <span>Abra o site no <strong>Safari</strong></span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs shrink-0 mt-0.5">2</span>
                    <span>Toque no botão <Share className="w-4 h-4 inline align-text-bottom" /> <strong>Compartilhar</strong> (ícone de quadrado com seta para cima, na barra inferior)</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs shrink-0 mt-0.5">3</span>
                    <span>Role a lista para baixo e toque em <PlusSquare className="w-4 h-4 inline align-text-bottom" /> <strong>"Adicionar à Tela de Início"</strong></span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs shrink-0 mt-0.5">4</span>
                    <span>Edite o nome se desejar e toque em <strong>"Adicionar"</strong> no canto superior direito</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs shrink-0 mt-0.5">5</span>
                    <span>O ícone do app aparecerá na sua <strong>tela inicial</strong> como qualquer outro aplicativo</span>
                  </li>
                </ol>

                <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
                  💡 <strong>Dica:</strong> Após instalar, o app abrirá em tela cheia, sem a barra de endereço do Safari, como um app nativo!
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="desktop">
            <Card>
              <CardContent className="p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Monitor className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-foreground">Computador</h2>
                    <p className="text-xs text-muted-foreground">Chrome, Edge, Brave, Opera</p>
                  </div>
                </div>

                <div className="space-y-1">
                  <h3 className="text-sm font-medium text-foreground">Via Google Chrome / Edge</h3>
                  <ol className="space-y-3 text-sm text-muted-foreground mt-2">
                    <li className="flex items-start gap-3">
                      <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs shrink-0 mt-0.5">1</span>
                      <span>Acesse o site no navegador</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs shrink-0 mt-0.5">2</span>
                      <span>Clique no ícone <ArrowDown className="w-4 h-4 inline align-text-bottom" /> de instalação que aparece na <strong>barra de endereço</strong> (lado direito)</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs shrink-0 mt-0.5">3</span>
                      <span>Clique em <strong>"Instalar"</strong> para confirmar</span>
                    </li>
                  </ol>
                </div>

                <div className="border-t border-border pt-4 space-y-1">
                  <h3 className="text-sm font-medium text-foreground">Alternativa (menu do navegador)</h3>
                  <ol className="space-y-3 text-sm text-muted-foreground mt-2">
                    <li className="flex items-start gap-3">
                      <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs shrink-0 mt-0.5">1</span>
                      <span>Clique no menu <MoreVertical className="w-4 h-4 inline align-text-bottom" /> (três pontos) do navegador</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs shrink-0 mt-0.5">2</span>
                      <span>Selecione <strong>"Instalar AnthOS..."</strong> ou <strong>"Salvar e compartilhar" → "Instalar"</strong></span>
                    </li>
                  </ol>
                </div>

                <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
                  💡 <strong>Dica:</strong> O app instalado abre em sua própria janela, sem barras do navegador, e aparece na barra de tarefas/dock do sistema.
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Benefits section */}
        <Card>
          <CardContent className="p-6">
            <h2 className="font-semibold text-foreground mb-4">Vantagens do app instalado</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Globe className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Funciona offline</p>
                  <p className="text-xs text-muted-foreground">Acesse dados essenciais mesmo sem internet</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Download className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Leve e rápido</p>
                  <p className="text-xs text-muted-foreground">Ocupa menos de 5MB no dispositivo</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Monitor className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Tela cheia</p>
                  <p className="text-xs text-muted-foreground">Abre sem barras do navegador</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Chrome className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Sempre atualizado</p>
                  <p className="text-xs text-muted-foreground">Recebe atualizações automaticamente</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="text-center pb-4">
          <p className="text-xs text-muted-foreground">
            Não é necessário baixar da App Store ou Play Store. O app é instalado direto do navegador.
          </p>
        </div>
      </div>
    </div>
  );
}
