import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight, Play, CheckCircle2, MapPin } from "lucide-react";
import { TutorialVideoPlayer } from "./TutorialVideoPlayer";
import { DifficultyBadge } from "./DifficultyBadge";
import { useWalkthrough } from "@/hooks/useWalkthrough";
import type { TutorialSection } from "@/data/tutorials";
import type { SearchMatch } from "@/pages/Ajuda";

interface TutorialCardProps {
  section: TutorialSection;
  isOpen: boolean;
  onToggle: () => void;
  isRead: boolean;
  onMarkRead: () => void;
  searchMatches?: SearchMatch[];
  searchQuery?: string;
}

function HighlightText({ text, query }: { text: string; query?: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-primary/25 text-foreground rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export function TutorialCard({ section, isOpen, onToggle, isRead, onMarkRead, searchMatches = [], searchQuery }: TutorialCardProps) {
  const Icon = section.icon;
  const { startTour } = useWalkthrough();

  const handleToggle = () => {
    if (!isOpen) onMarkRead();
    onToggle();
  };

  return (
    <div className={`bg-card border rounded-xl overflow-hidden transition-colors ${isRead ? "border-border/50" : "border-border"}`}>
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-foreground text-sm">
              <HighlightText text={section.title} query={searchQuery} />
            </h3>
            <DifficultyBadge difficulty={section.difficulty} />
            {isRead && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
            <HighlightText text={section.description} query={searchQuery} />
          </p>
          {/* Search match indicators */}
          {searchMatches.length > 0 && !isOpen && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {searchMatches.slice(0, 4).map((match, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium">
                  <MapPin className="w-2.5 h-2.5" />
                  {match.location}
                </span>
              ))}
              {searchMatches.length > 4 && (
                <span className="text-[10px] text-muted-foreground">+{searchMatches.length - 4} mais</span>
              )}
            </div>
          )}
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
              {/* Search matches summary */}
              {searchMatches.length > 0 && (
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/15 space-y-1.5">
                  <h4 className="text-xs font-semibold text-primary flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    Encontrado em {searchMatches.length} {searchMatches.length === 1 ? "local" : "locais"}
                  </h4>
                  {searchMatches.map((match, i) => (
                    <div key={i} className="text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{match.location}:</span>{" "}
                      <HighlightText text={match.text} query={searchQuery} />
                    </div>
                  ))}
                </div>
              )}

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
                      <span className="text-foreground/90">
                        <HighlightText text={step} query={searchQuery} />
                      </span>
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
                        <HighlightText text={tip} query={searchQuery} />
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
                        <span className="text-muted-foreground text-xs">
                          <HighlightText text={sc.action} query={searchQuery} />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Example */}
              {section.example && (
                <div className="mt-4 p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-3">
                  <h4 className="text-sm font-bold text-primary flex items-center gap-2">
                    🏬 {section.example.title}
                  </h4>
                  <p className="text-xs text-muted-foreground">{section.example.description}</p>
                  <ol className="space-y-2">
                    {section.example.steps.map((step, i) => (
                      <li key={i} className="flex gap-3 text-sm">
                        <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <span className="text-foreground/90">
                          <HighlightText text={step} query={searchQuery} />
                        </span>
                      </li>
                    ))}
                  </ol>
                  <div className="pt-2 border-t border-primary/10 space-y-1">
                    {section.example.conclusion.map((c, i) => (
                      <p key={i} className="text-sm text-primary font-medium flex gap-2">
                        <span>✅</span> {c}
                      </p>
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
