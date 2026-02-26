import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight, Play } from "lucide-react";
import { TutorialVideoPlayer } from "./TutorialVideoPlayer";
import { useWalkthrough } from "@/hooks/useWalkthrough";
import type { TutorialSection } from "@/data/tutorials";

interface TutorialCardProps {
  section: TutorialSection;
  isOpen: boolean;
  onToggle: () => void;
}

export function TutorialCard({ section, isOpen, onToggle }: TutorialCardProps) {
  const Icon = section.icon;
  const { startTour } = useWalkthrough();

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground text-sm">{section.title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{section.description}</p>
        </div>
        {isOpen ? (
          <ChevronDown className="w-5 h-5 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 space-y-4 border-t border-border pt-4">
              {/* Tour interativo */}
              {section.walkthroughId && (
                <button
                  onClick={() => startTour(section.walkthroughId!)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
                >
                  <Play className="w-4 h-4" />
                  Iniciar Tour Interativo
                </button>
              )}

              {/* Video */}
              <TutorialVideoPlayer videoUrl={section.videoUrl} title={section.title} />

              <p className="text-sm text-muted-foreground">{section.description}</p>

              {/* Steps */}
              <div>
                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">
                  📋 Passo a passo
                </h4>
                <ol className="space-y-2">
                  {section.steps.map((step, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-foreground/90">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Tips */}
              {section.tips && section.tips.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">
                    💡 Dicas
                  </h4>
                  <ul className="space-y-1.5">
                    {section.tips.map((tip, i) => (
                      <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                        <span className="text-primary">•</span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Shortcuts */}
              {section.shortcuts && section.shortcuts.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">
                    ⌨️ Atalhos de teclado
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {section.shortcuts.map((sc, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <kbd className="px-2 py-1 rounded bg-muted text-foreground font-mono text-xs border border-border">
                          {sc.key}
                        </kbd>
                        <span className="text-muted-foreground text-xs">{sc.action}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
