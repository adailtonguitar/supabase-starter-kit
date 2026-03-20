import { useEffect, useRef } from "react";

/**
 * Hook para capturar leitura de código de barras via scanner físico.
 * Suporta formato quantidade*código (ex: 5*7891234567890) — o parsing
 * é feito no handleBarcodeSubmit do PDV, aqui apenas capturamos o raw input.
 */
export function useBarcodeScanner(onScan: (barcode: string) => void) {
  const bufferRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only capture from scanner (rapid keystrokes) when focused on body or barcode input
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;
      if (target.dataset?.noBarcodeFocus) return;

      if (e.key === "Enter" && bufferRef.current.length >= 4) {
        e.preventDefault();
        onScan(bufferRef.current);
        bufferRef.current = "";
        return;
      }

      if (e.key.length === 1) {
        bufferRef.current += e.key;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => { bufferRef.current = ""; }, 100);
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [onScan]);
}
