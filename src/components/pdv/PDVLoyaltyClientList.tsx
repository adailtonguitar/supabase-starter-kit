interface PDVLoyaltyClientListProps {
  onSelect: (client: { id: string; name: string; cpf?: string }) => void;
}

export function PDVLoyaltyClientList({ onSelect }: PDVLoyaltyClientListProps) {
  return (
    <div className="p-5 text-center text-sm text-muted-foreground">
      Módulo de fidelidade em desenvolvimento.
    </div>
  );
}
