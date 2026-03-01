import { useState, useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, X, ScanBarcode } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BarcodeCameraScannerProps {
  onScan: (barcode: string) => void;
}

export function BarcodeCameraScanner({ onScan }: BarcodeCameraScannerProps) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scannedRef = useRef(false);

  const startScanner = async () => {
    setError(null);
    setScanning(true);
    scannedRef.current = false;

    try {
      // Test camera access first with getUserMedia
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      // Stop test stream immediately
      stream.getTracks().forEach(track => track.stop());

      const scanner = new Html5Qrcode("barcode-camera-reader");
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 280, height: 120 },
          aspectRatio: 1.777,
        },
        (decodedText) => {
          if (scannedRef.current) return;
          scannedRef.current = true;
          onScan(decodedText);
          stopScanner();
        },
        () => {} // ignore scan failures
      );
    } catch (err: any) {
      console.error("[BarcodeCameraScanner] Error:", err?.name, err?.message, err);
      let msg = "Não foi possível acessar a câmera.";
      if (err?.name === "NotAllowedError" || err?.message?.includes("Permission")) {
        msg = "Permissão da câmera negada. Vá em Configurações do navegador → Câmera → Permitir.";
      } else if (err?.name === "NotFoundError") {
        msg = "Nenhuma câmera encontrada no dispositivo.";
      } else if (err?.name === "NotReadableError" || err?.name === "AbortError") {
        msg = "Câmera em uso por outro app. Feche outros apps e tente novamente.";
      } else if (err?.name === "OverconstrainedError") {
        msg = "Câmera traseira não encontrada. Tentando câmera frontal...";
        // Fallback: try any camera
        try {
          const scanner = new Html5Qrcode("barcode-camera-reader");
          scannerRef.current = scanner;
          await scanner.start(
            { facingMode: "user" },
            { fps: 10, qrbox: { width: 280, height: 120 } },
            (decodedText) => {
              if (scannedRef.current) return;
              scannedRef.current = true;
              onScan(decodedText);
              stopScanner();
            },
            () => {}
          );
          return; // success with front camera
        } catch {
          msg = "Nenhuma câmera disponível.";
        }
      }
      setError(msg);
      setScanning(false);
    }
  };

  const stopScanner = async () => {
    try {
      if (scannerRef.current?.isScanning) {
        await scannerRef.current.stop();
      }
      scannerRef.current?.clear();
    } catch {}
    scannerRef.current = null;
    setScanning(false);
  };

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  if (!scanning) {
    return (
      <div className="flex flex-col gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={startScanner}
          className="gap-2 border-primary/30 hover:border-primary hover:bg-primary/5"
        >
          <Camera className="w-4 h-4" />
          Escanear com Câmera
        </Button>
        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="relative rounded-xl overflow-hidden border-2 border-primary/40 bg-black">
      {/* Scanner viewport */}
      <div id="barcode-camera-reader" ref={containerRef} className="w-full" />

      {/* Overlay hint */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-white/90 text-xs">
          <ScanBarcode className="w-4 h-4" />
          Aponte para o código de barras
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={stopScanner}
          className="text-white hover:text-white hover:bg-white/20 gap-1"
        >
          <X className="w-4 h-4" />
          Fechar
        </Button>
      </div>
    </div>
  );
}
