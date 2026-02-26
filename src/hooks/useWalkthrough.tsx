import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { walkthroughModules, type WalkthroughModule } from "@/data/walkthrough-steps";

interface WalkthroughContextType {
  running: boolean;
  currentModule: WalkthroughModule | null;
  startTour: (moduleId: string) => void;
  stopTour: () => void;
}

const WalkthroughContext = createContext<WalkthroughContextType>({
  running: false,
  currentModule: null,
  startTour: () => {},
  stopTour: () => {},
});

export function WalkthroughProvider({ children }: { children: ReactNode }) {
  const [running, setRunning] = useState(false);
  const [currentModule, setCurrentModule] = useState<WalkthroughModule | null>(null);
  const navigate = useNavigate();

  const startTour = useCallback((moduleId: string) => {
    const mod = walkthroughModules.find((m) => m.id === moduleId);
    if (!mod) return;
    
    // Navigate to the module's route first
    navigate(mod.route);
    
    // Small delay to let the page render before starting the tour
    setTimeout(() => {
      setCurrentModule(mod);
      setRunning(true);
    }, 600);
  }, [navigate]);

  const stopTour = useCallback(() => {
    setRunning(false);
    setCurrentModule(null);
  }, []);

  return (
    <WalkthroughContext.Provider value={{ running, currentModule, startTour, stopTour }}>
      {children}
    </WalkthroughContext.Provider>
  );
}

export function useWalkthrough() {
  return useContext(WalkthroughContext);
}
