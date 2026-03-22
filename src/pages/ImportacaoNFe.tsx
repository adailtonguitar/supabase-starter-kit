import { PlanGate } from "@/components/PlanGate";
import SmartNFeImport from "@/components/import-nfe/SmartNFeImport";

export default function ImportacaoNFe() {
  return (
    <PlanGate feature="hasDFe" featureName="Importação Inteligente de NF-e">
      <SmartNFeImport />
    </PlanGate>
  );
}
