import { useRef } from "react";
import { formatCurrency } from "@/lib/utils";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DANFeItem {
  name: string;
  productCode: string;
  ncm: string;
  cfop: string;
  cst: string;
  unit: string;
  qty: number;
  unitPrice: number;
  discount: number;
  total: number;
  origem: string;
  icmsAliquota: number;
}

interface DANFeData {
  // Emitente
  companyName: string;
  companyCnpj: string;
  companyIe: string;
  companyAddress: string;
  companyPhone: string;
  logoUrl: string | null;
  // Destinatário
  destName: string;
  destDoc: string;
  destIe: string;
  destAddress: string;
  destEmail: string;
  // Nota
  number: string | number | null;
  accessKey: string | null;
  natOp: string;
  emissionDate: string;
  // Itens
  items: DANFeItem[];
  // Pagamento
  paymentMethod: string;
  paymentLabel: string;
  totalValue: number;
  // Transporte
  frete: string;
  transportName: string;
  // Info adicional
  infAdic: string;
}

const PAYMENT_LABELS: Record<string, string> = {
  "01": "Dinheiro", "02": "Cheque", "03": "Cartão de Crédito",
  "04": "Cartão de Débito", "05": "Crédito Loja", "15": "Boleto",
  "16": "Depósito Bancário", "17": "PIX", "90": "Sem Pagamento", "99": "Outros",
};

const FRETE_LABELS: Record<string, string> = {
  "0": "CIF (Remetente)", "1": "FOB (Destinatário)", "2": "Terceiros",
  "3": "Próprio Remetente", "4": "Próprio Destinatário", "9": "Sem Frete",
};

function formatAccessKey(key: string): string {
  return key.replace(/(\d{4})(?=\d)/g, "$1 ");
}

export function DANFePrintButton({ data }: { data: DANFeData }) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;

    const printWindow = window.open("", "_blank", "width=900,height=1200");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>DANFE - NF-e ${data.number || ""}</title>
        <style>
          @page { size: A4; margin: 10mm; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, Helvetica, sans-serif; font-size: 9px; color: #000; background: #fff; }
          .danfe { width: 100%; max-width: 190mm; margin: 0 auto; }
          .border-box { border: 1px solid #000; }
          .grid { display: flex; }
          .cell { border: 1px solid #000; padding: 2px 4px; }
          .cell-label { font-size: 6px; color: #555; text-transform: uppercase; line-height: 1.2; }
          .cell-value { font-size: 9px; font-weight: bold; line-height: 1.4; }
          .header { display: flex; border: 2px solid #000; }
          .header-logo { width: 30%; display: flex; align-items: center; justify-content: center; padding: 4px; border-right: 1px solid #000; flex-direction: column; gap: 2px; }
          .header-logo img { max-height: 50px; max-width: 100%; object-fit: contain; }
          .header-logo .company-name { font-size: 11px; font-weight: bold; text-align: center; }
          .header-logo .company-info { font-size: 7px; text-align: center; color: #333; }
          .header-danfe { width: 20%; display: flex; flex-direction: column; align-items: center; justify-content: center; border-right: 1px solid #000; padding: 4px; }
          .header-danfe .title { font-size: 14px; font-weight: bold; }
          .header-danfe .subtitle { font-size: 7px; text-align: center; }
          .header-danfe .entry-exit { font-size: 10px; font-weight: bold; margin: 4px 0; border: 1px solid #000; padding: 2px 8px; }
          .header-danfe .nf-number { font-size: 10px; font-weight: bold; }
          .header-access { width: 50%; display: flex; flex-direction: column; padding: 4px; }
          .header-access .barcode-area { flex: 1; display: flex; align-items: center; justify-content: center; font-family: monospace; font-size: 7px; word-break: break-all; padding: 4px; }
          .header-access .key-label { font-size: 6px; color: #555; }
          .header-access .key-value { font-size: 8px; font-family: monospace; word-break: break-all; }
          .section-title { background: #e5e5e5; padding: 2px 4px; font-size: 7px; font-weight: bold; text-transform: uppercase; border: 1px solid #000; border-bottom: none; }
          .section-row { display: flex; }
          .section-row .cell { flex: 1; }
          table.items { width: 100%; border-collapse: collapse; font-size: 8px; }
          table.items th { background: #e5e5e5; border: 1px solid #000; padding: 2px 3px; font-size: 6px; text-transform: uppercase; font-weight: bold; }
          table.items td { border: 1px solid #000; padding: 2px 3px; }
          table.items td.right { text-align: right; }
          table.items td.center { text-align: center; }
          .info-adic { border: 1px solid #000; padding: 4px; min-height: 30px; font-size: 7px; }
          .footer { font-size: 6px; text-align: center; color: #888; margin-top: 4px; }
          @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        </style>
      </head>
      <body>
        ${content.innerHTML}
      </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 400);
  };

  const now = data.emissionDate || new Date().toLocaleString("pt-BR");

  return (
    <>
      <Button onClick={handlePrint} variant="outline" size="sm" className="gap-1.5">
        <Printer className="w-4 h-4" /> Imprimir DANFE
      </Button>

      {/* Hidden printable content */}
      <div style={{ position: "absolute", left: "-9999px", top: 0 }}>
        <div ref={printRef}>
          <div className="danfe">
            {/* ── HEADER ── */}
            <div className="header">
              <div className="header-logo">
                {data.logoUrl && (
                  <img src={data.logoUrl} alt="Logo" />
                )}
                <div className="company-name">{data.companyName}</div>
                <div className="company-info">
                  {data.companyAddress}<br />
                  {data.companyCnpj && `CNPJ: ${data.companyCnpj}`}
                  {data.companyIe && ` | IE: ${data.companyIe}`}
                  {data.companyPhone && <><br />Fone: {data.companyPhone}</>}
                </div>
              </div>
              <div className="header-danfe">
                <div className="title">DANFE</div>
                <div className="subtitle">DOCUMENTO AUXILIAR DA<br />NOTA FISCAL ELETRÔNICA</div>
                <div className="entry-exit">0 - ENTRADA<br />1 - SAÍDA</div>
                <div className="nf-number">Nº {data.number || "---"}</div>
              </div>
              <div className="header-access">
                <div className="barcode-area">
                  {data.accessKey || "Chave de acesso não disponível"}
                </div>
                <div className="key-label">CHAVE DE ACESSO</div>
                <div className="key-value">
                  {data.accessKey ? formatAccessKey(data.accessKey) : "---"}
                </div>
              </div>
            </div>

            {/* ── NATUREZA DA OPERAÇÃO ── */}
            <div className="section-row">
              <div className="cell" style={{ flex: 3 }}>
                <div className="cell-label">Natureza da Operação</div>
                <div className="cell-value">{data.natOp}</div>
              </div>
              <div className="cell" style={{ flex: 1 }}>
                <div className="cell-label">Data de Emissão</div>
                <div className="cell-value">{now}</div>
              </div>
            </div>

            {/* ── DESTINATÁRIO ── */}
            <div className="section-title">Destinatário / Remetente</div>
            <div className="section-row">
              <div className="cell" style={{ flex: 3 }}>
                <div className="cell-label">Nome / Razão Social</div>
                <div className="cell-value">{data.destName}</div>
              </div>
              <div className="cell" style={{ flex: 1 }}>
                <div className="cell-label">CNPJ / CPF</div>
                <div className="cell-value">{data.destDoc}</div>
              </div>
              <div className="cell" style={{ flex: 1 }}>
                <div className="cell-label">Inscrição Estadual</div>
                <div className="cell-value">{data.destIe || "ISENTO"}</div>
              </div>
            </div>
            <div className="section-row">
              <div className="cell" style={{ flex: 3 }}>
                <div className="cell-label">Endereço</div>
                <div className="cell-value">{data.destAddress}</div>
              </div>
              <div className="cell" style={{ flex: 1 }}>
                <div className="cell-label">E-mail</div>
                <div className="cell-value" style={{ fontSize: "7px" }}>{data.destEmail || "—"}</div>
              </div>
            </div>

            {/* ── ITENS ── */}
            <div className="section-title">Dados dos Produtos / Serviços</div>
            <table className="items">
              <thead>
                <tr>
                  <th style={{ width: "5%" }}>#</th>
                  <th style={{ width: "8%" }}>Código</th>
                  <th style={{ width: "30%" }}>Descrição do Produto / Serviço</th>
                  <th style={{ width: "8%" }}>NCM</th>
                  <th style={{ width: "6%" }}>CFOP</th>
                  <th style={{ width: "5%" }}>UN</th>
                  <th style={{ width: "6%" }}>Qtd</th>
                  <th style={{ width: "10%" }}>Vl. Unit.</th>
                  <th style={{ width: "8%" }}>Desc.</th>
                  <th style={{ width: "10%" }}>Vl. Total</th>
                  <th style={{ width: "4%" }}>Orig</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="center">{idx + 1}</td>
                    <td>{item.productCode || "—"}</td>
                    <td>{item.name}</td>
                    <td>{item.ncm}</td>
                    <td className="center">{item.cfop}</td>
                    <td className="center">{item.unit}</td>
                    <td className="right">{item.qty}</td>
                    <td className="right">{item.unitPrice.toFixed(2)}</td>
                    <td className="right">{item.discount > 0 ? item.discount.toFixed(2) : "—"}</td>
                    <td className="right">{item.total.toFixed(2)}</td>
                    <td className="center">{item.origem}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ── TOTAIS ── */}
            <div className="section-title">Cálculo do Imposto</div>
            <div className="section-row">
              <div className="cell" style={{ flex: 1 }}>
                <div className="cell-label">Base de Cálculo ICMS</div>
                <div className="cell-value">{data.totalValue.toFixed(2)}</div>
              </div>
              <div className="cell" style={{ flex: 1 }}>
                <div className="cell-label">Valor Total dos Produtos</div>
                <div className="cell-value">{data.totalValue.toFixed(2)}</div>
              </div>
              <div className="cell" style={{ flex: 1 }}>
                <div className="cell-label">Valor Total da Nota</div>
                <div className="cell-value" style={{ fontSize: "11px" }}>{data.totalValue.toFixed(2)}</div>
              </div>
            </div>

            {/* ── TRANSPORTE ── */}
            <div className="section-title">Transportador / Volumes Transportados</div>
            <div className="section-row">
              <div className="cell" style={{ flex: 1 }}>
                <div className="cell-label">Modalidade do Frete</div>
                <div className="cell-value">{FRETE_LABELS[data.frete] || data.frete}</div>
              </div>
              <div className="cell" style={{ flex: 2 }}>
                <div className="cell-label">Nome / Razão Social</div>
                <div className="cell-value">{data.transportName || "—"}</div>
              </div>
            </div>

            {/* ── PAGAMENTO ── */}
            <div className="section-title">Dados de Pagamento</div>
            <div className="section-row">
              <div className="cell" style={{ flex: 1 }}>
                <div className="cell-label">Forma de Pagamento</div>
                <div className="cell-value">{PAYMENT_LABELS[data.paymentMethod] || data.paymentLabel}</div>
              </div>
              <div className="cell" style={{ flex: 1 }}>
                <div className="cell-label">Valor do Pagamento</div>
                <div className="cell-value">{data.totalValue.toFixed(2)}</div>
              </div>
            </div>

            {/* ── INFORMAÇÕES ADICIONAIS ── */}
            <div className="section-title">Informações Adicionais</div>
            <div className="info-adic">
              {data.infAdic || "Sem informações adicionais."}
            </div>

            <div className="footer">
              Documento auxiliar da NF-e — Consulte a autenticidade em www.nfe.fazenda.gov.br
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
