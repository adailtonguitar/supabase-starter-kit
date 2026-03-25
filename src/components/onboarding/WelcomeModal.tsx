import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Play, Sparkles } from "lucide-react";
import { useOnboardingChecklist } from "@/hooks/useOnboardingChecklist";

// Welcome video URL — replace with hosted URL of the Remotion-rendered video
const WELCOME_VIDEO_URL = "";

export function WelcomeModal() {
  const { welcomeSeen, markWelcomeSeen } = useOnboardingChecklist();
  const [step, setStep] = useState<"video" | "done">("video");

  if (welcomeSeen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: "spring", damping: 20, stiffness: 200 }}
          className="relative w-full max-w-2xl mx-4 rounded-2xl bg-card border border-border shadow-2xl overflow-hidden"
        >
          {/* Close button */}
          <button
            onClick={markWelcomeSeen}
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-background/80 hover:bg-background transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>

          {step === "video" ? (
            <div className="flex flex-col">
              {/* Video area */}
              {WELCOME_VIDEO_URL ? (
                <div className="aspect-video bg-background">
                  <video
                    src={WELCOME_VIDEO_URL}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                    onEnded={() => setStep("done")}
                  />
                </div>
              ) : (
                /* Fallback: animated welcome screen when no video URL */
                <div className="aspect-video bg-gradient-to-br from-background via-card to-background flex items-center justify-center">
                  <div className="text-center space-y-4">
                    <motion.div
                      initial={{ scale: 0, rotate: 180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", damping: 12, delay: 0.2 }}
                      className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg"
                    >
                      <span className="text-4xl font-extrabold text-primary-foreground">A</span>
                    </motion.div>
                    <motion.h2
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                      className="text-3xl font-bold text-foreground"
                    >
                      Bem-vindo ao AnthoSystem!
                    </motion.h2>
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.7 }}
                      className="text-muted-foreground max-w-md mx-auto"
                    >
                      Seu sistema de gestão completo com PDV, Fiscal, Financeiro e Estoque integrados.
                    </motion.p>
                  </div>
                </div>
              )}

              {/* Bottom bar */}
              <div className="p-6 flex items-center justify-between">
                <div className="flex items-center gap-2 text-primary">
                  <Sparkles className="w-5 h-5" />
                  <span className="text-sm font-semibold">Vamos configurar tudo!</span>
                </div>
                <button
                  onClick={markWelcomeSeen}
                  className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors flex items-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  Começar
                </button>
              </div>
            </div>
          ) : null}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
