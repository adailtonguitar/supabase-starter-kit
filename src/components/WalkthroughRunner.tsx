import Joyride, { STATUS, type CallBackProps } from "react-joyride";
import { useWalkthrough } from "@/hooks/useWalkthrough";

export function WalkthroughRunner() {
  const { running, currentModule, stopTour } = useWalkthrough();

  const handleCallback = (data: CallBackProps) => {
    const { status } = data;
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      stopTour();
    }
  };

  if (!running || !currentModule) return null;

  return (
    <Joyride
      steps={currentModule.steps}
      run={running}
      continuous
      showSkipButton
      showProgress
      scrollToFirstStep
      disableOverlayClose
      callback={handleCallback}
      locale={{
        back: "Voltar",
        close: "Fechar",
        last: "Finalizar",
        next: "Próximo",
        skip: "Pular tour",
        open: "Abrir",
      }}
      styles={{
        options: {
          primaryColor: "hsl(var(--primary))",
          zIndex: 10000,
          arrowColor: "hsl(var(--card))",
          backgroundColor: "hsl(var(--card))",
          textColor: "hsl(var(--foreground))",
        },
        tooltip: {
          borderRadius: 12,
          padding: 20,
          fontSize: 14,
        },
        tooltipContent: {
          padding: "12px 0",
        },
        buttonNext: {
          borderRadius: 8,
          padding: "8px 16px",
          fontSize: 13,
          fontWeight: 600,
        },
        buttonBack: {
          color: "hsl(var(--muted-foreground))",
          fontSize: 13,
        },
        buttonSkip: {
          color: "hsl(var(--muted-foreground))",
          fontSize: 12,
        },
        spotlight: {
          borderRadius: 12,
        },
        overlay: {
          backgroundColor: "rgba(0, 0, 0, 0.5)",
        },
      }}
    />
  );
}
