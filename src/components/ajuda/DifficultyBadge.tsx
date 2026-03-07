import type { TutorialDifficulty } from "@/data/tutorials";

const config: Record<TutorialDifficulty, { label: string; color: string }> = {
  basico: { label: "Básico", color: "bg-green-500/15 text-green-600 dark:text-green-400" },
  intermediario: { label: "Intermediário", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  avancado: { label: "Avançado", color: "bg-red-500/15 text-red-600 dark:text-red-400" },
};

export function DifficultyBadge({ difficulty }: { difficulty: TutorialDifficulty }) {
  const { label, color } = config[difficulty];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${color}`}>
      {label}
    </span>
  );
}
