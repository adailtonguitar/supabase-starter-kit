interface Props { onComplete: () => void; }

export function OnboardingWizard({ onComplete }: Props) {
  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="text-center p-8">
        <h1 className="text-2xl font-bold text-foreground mb-4">Bem-vindo ao Antho System</h1>
        <p className="text-muted-foreground mb-6">Configure sua empresa para começar.</p>
        <button onClick={onComplete} className="px-6 py-2 bg-primary text-primary-foreground rounded-md">
          Começar
        </button>
      </div>
    </div>
  );
}
