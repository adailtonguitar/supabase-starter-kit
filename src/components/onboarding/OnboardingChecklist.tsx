import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Circle, ChevronRight, X, PartyPopper } from "lucide-react";
import { useOnboardingChecklist } from "@/hooks/useOnboardingChecklist";
import { Progress } from "@/components/ui/progress";

export function OnboardingChecklist() {
  const navigate = useNavigate();
  const {
    steps,
    completedSteps,
    completeStep,
    dismissChecklist,
    progress,
    completedCount,
    totalSteps,
    showChecklist,
    allDone,
    checklistLoaded,
  } = useOnboardingChecklist();

  if (!checklistLoaded) return null;
  if (!showChecklist && !allDone) return null;
  if (!showChecklist) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      className="bg-card border border-border rounded-2xl p-5 shadow-lg"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            🚀 Primeiros Passos
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {completedCount} de {totalSteps} concluídos
          </p>
        </div>
        <button
          onClick={dismissChecklist}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          title="Dispensar"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Progress bar */}
      <Progress value={progress} className="h-2 mb-4" />

      {/* Steps */}
      <div className="space-y-2">
        <AnimatePresence>
          {steps.map((step, i) => {
            const isCompleted = completedSteps.includes(step.id);
            return (
              <motion.button
                key={step.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => {
                  if (!isCompleted) completeStep(step.id);
                  navigate(step.route);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                  isCompleted
                    ? "bg-primary/5 border border-primary/15"
                    : "hover:bg-muted/50 border border-transparent"
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                ) : (
                  <Circle className="w-5 h-5 text-muted-foreground/40 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <span className={`text-sm font-medium ${isCompleted ? "text-primary line-through" : "text-foreground"}`}>
                    {step.icon} {step.title}
                  </span>
                  <p className="text-[11px] text-muted-foreground line-clamp-1">{step.description}</p>
                </div>
                {!isCompleted && (
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>

      {/* All done celebration */}
      {allDone && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mt-4 p-4 rounded-xl bg-primary/10 border border-primary/20 text-center"
        >
          <PartyPopper className="w-8 h-8 text-primary mx-auto mb-2" />
          <p className="text-sm font-bold text-primary">Parabéns! Tudo configurado!</p>
          <p className="text-xs text-muted-foreground mt-1">Seu sistema está pronto para usar.</p>
        </motion.div>
      )}
    </motion.div>
  );
}
