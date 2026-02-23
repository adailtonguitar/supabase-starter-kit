import { ReactNode } from "react";

interface PlanGateProps {
  feature: string;
  featureName: string;
  children: ReactNode;
}

export function PlanGate({ children }: PlanGateProps) {
  // TODO: replace with real plan gate logic from original
  return <>{children}</>;
}
