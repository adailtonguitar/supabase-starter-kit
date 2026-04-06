import { useRef } from "react";
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
  companyName: string;
  companyCnpj: string;
  companyIe: string;
  companyAddress: string;
  companyPhone: string;
  logoUrl: string | null;
  destName: string;
  destDoc: string;
  destIe: string;
  destAddress: string;
  destBairro?: string;
  destCep?: string;
  destMunicipio?: string;
  destUf?: string;
  destFone?: string;
  destEmail: string;
  number: string | number | null;
  accessKey: string | null;
  natOp: string;
  emissionDate: string;
  emissionTime?: string;
  protocoloAutorizacao?: string;
  serie?: string;
  items: DANFeItem[];
  paymentMethod: string;
  paymentLabel: string;
  totalValue: number;
  frete: string;
  transportName: string;
  transportAddress?: string;
  transportMunicipio?: string;
  transportUf?: string;
  transportIe?: string;
  transportCnpj?: string;
  transportAntt?: string;
  transportPlaca?: string;
  transportPlacaUf?: string;
  volQtd?: string;
  volEspecie?: string;
  volMarca?: string;
  volNumeracao?: string;
  volPesoBruto?: string;
  volPesoLiquido?: string;
  infAdic: string;
}

const FRETE_LABELS: Record<string, string> = {
  "0": "0 - CIF (Remetente)",
  "1": "1 - FOB (Destinatário)",
  "2": "2 - Terceiros",
  "3": "3 - Próprio Remetente",
  "4": "4 - Próprio Destinatário",
  "9": "9 - Sem Frete",
};

function formatAccessKey(key: string): string {
  return key.replace(/(\d{4})(?=\d)/g, "$1 ");
}

function formatNumber(n: string | number | null): string {
  if (!n) return "---";
  const s = String(n).padStart(9, "0");
  return s.replace(/(\d{3})(\d{3})(\d{3})/, "$1.$2.$3");
}

function fmt(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQty(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function extractUF(address: string): string {
  const match = address.match(/\/([A-Z]{2})/);
  return match?.[1] || "";
}

const DANFE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Libre+Barcode+128+Text&display=swap');

@page { size: A4; margin: 8mm; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 8px; color: #000; background: #fff; line-height: 1.3; }
.danfe { width: 100%; max-width: 190mm; margin: 0 auto; }

/* Shared cell */
.b { border: 1px solid #000; }
.bt0 { border-top: none; }
.bl0 { border-left: none; }
.bb0 { border-bottom: none; }
.br0 { border-right: none; }
.lbl { font-size: 5.5px; color: #444; text-transform: uppercase; line-height: 1.1; padding: 1px 3px 0; }
.val { font-size: 8px; font-weight: bold; padding: 0 3px 1px; white-space: nowrap; overflow: hidden; }
.val-sm { font-size: 7px; }
.row { display: flex; }
.cell { display: flex; flex-direction: column; }

/* ── Recibo (canhoto) ── */
.recibo { display: flex; border: 2px solid #000; margin-bottom: 4px; }
.recibo-text { flex: 1; padding: 4px 6px; font-size: 7px; }
.recibo-nfe { width: 85px; border-left: 1px solid #000; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4px; }
.recibo-nfe .t { font-size: 10px; font-weight: bold; }
.recibo-nfe .n { font-size: 9px; font-weight: bold; margin-top: 2px; }
.recibo-fields { display: flex; margin-top: 6px; }
.recibo-fields .rf { flex: 1; border-top: 1px solid #000; padding-top: 2px; }
.recibo-fields .rf:first-child { margin-right: 12px; }
.recibo-fields .rf .rl { font-size: 5.5px; color: #444; text-transform: uppercase; }

/* ── Header ── */
.header { display: flex; border: 2px solid #000; }
.h-logo { width: 33%; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 6px 8px; border-right: 1px solid #000; }
.h-logo img { max-height: 40px; max-width: 85%; object-fit: contain; margin-bottom: 3px; }
.h-logo .cn { font-size: 12px; font-weight: bold; text-align: center; line-height: 1.3; }
.h-logo .ci { font-size: 7px; text-align: center; color: #333; margin-top: 4px; line-height: 1.4; }

.h-danfe { width: 17%; display: flex; flex-direction: column; align-items: center; justify-content: center; border-right: 1px solid #000; padding: 4px; }
.h-danfe .title { font-size: 14px; font-weight: bold; letter-spacing: 1px; }
.h-danfe .sub { font-size: 6.5px; text-align: center; margin-top: 2px; line-height: 1.3; }
.h-danfe .es { display: flex; align-items: center; gap: 6px; margin: 5px 0; font-size: 8px; }
.h-danfe .es-box { border: 1px solid #000; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 10px; }
.h-danfe .nnum { font-size: 10px; font-weight: bold; }
.h-danfe .serie-label { font-size: 8px; font-weight: bold; margin-top: 2px; }
.h-danfe .page { font-size: 7px; margin-top: 2px; }

.h-access { width: 50%; display: flex; flex-direction: column; }
.h-fisco { border-bottom: 1px solid #000; padding: 2px 6px; }
.h-fisco .fisco-lbl { font-size: 6px; color: #444; text-transform: uppercase; margin-bottom: 2px; }
.h-fisco .barcode-area { display: flex; align-items: center; justify-content: center; min-height: 36px; overflow: hidden; }
.h-fisco .barcode-text { font-family: 'Libre Barcode 128 Text', monospace; font-size: 48px; letter-spacing: 0; line-height: 1; }
.h-key { padding: 3px 6px; }
.h-key .klbl { font-size: 6px; color: #444; text-transform: uppercase; margin-bottom: 1px; }
.h-key .kval { font-size: 8.5px; font-family: monospace; word-break: break-all; text-align: center; letter-spacing: 0.5px; }
.h-key .consult { font-size: 6px; color: #333; margin-top: 3px; text-align: center; line-height: 1.3; }

/* ── Section titles ── */
.sec { background: #e8e8e8; padding: 1px 4px; font-size: 6.5px; font-weight: bold; text-transform: uppercase; border: 1px solid #000; border-bottom: none; }
.sec.bt0 { border-top: none; }

/* ── Items table ── */
table.items { width: 100%; border-collapse: collapse; font-size: 7px; }
table.items th { background: #e8e8e8; border: 1px solid #000; padding: 1px 2px; font-size: 5.5px; text-transform: uppercase; font-weight: bold; text-align: center; }
table.items td { border: 1px solid #000; padding: 1px 2px; }
table.items td.r { text-align: right; }
table.items td.c { text-align: center; }

/* ── Info adicional ── */
.info-row { display: flex; border: 1px solid #000; border-top: none; min-height: 50px; }
.info-row .info-col { flex: 1; padding: 3px 4px; font-size: 7px; }
.info-row .info-col:first-child { border-right: 1px solid #000; }
.info-row .info-col .ilbl { font-size: 5.5px; color: #444; text-transform: uppercase; margin-bottom: 2px; }

.footer-text { font-size: 5.5px; text-align: center; color: #888; margin-top: 3px; }

@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
`;

export function DANFePrintButton({ data }: { data: DANFeData }) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const printWindow = window.open("", "_blank", "width=900,height=1200");
    if (!printWindow) return;
    printWindow.document.write(`<!DOCTYPE html><html><head><title>DANFE - NF-e ${data.number || ""}</title><style>${DANFE_CSS}</style><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+128+Text&display=swap" rel="stylesheet"></head><body>${content.innerHTML}</body></html>`);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 800);
  };

  const serie = data.serie || "1";
  const totalProd = data.items.reduce((s, i) => s + i.total, 0);
  const totalDesc = data.items.reduce((s, i) => s + i.discount, 0);
  const totalNota = data.totalValue;
  const destUf = data.destUf || extractUF(data.destAddress);

  return (
    <>
      <Button onClick={handlePrint} variant="outline" size="sm" className="gap-1.5">
        <Printer className="w-4 h-4" /> Imprimir DANFE
      </Button>

      <div style={{ position: "absolute", left: "-9999px", top: 0 }}>
        <div ref={printRef}>
          <div className="danfe">
            {/* ════════ RECIBO (CANHOTO) ════════ */}
            <div className="recibo">
              <div className="recibo-text">
                <span>RECEBEMOS DE <strong>{data.companyName}</strong> OS PRODUTOS/SERVIÇOS CONSTANTES DA NOTA FISCAL INDICADA AO LADO</span>
                <div className="recibo-fields">
                  <div className="rf">
                    <div className="rl">DATA DE RECEBIMENTO</div>
                  </div>
                  <div className="rf">
                    <div className="rl">IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR</div>
                  </div>
                </div>
              </div>
              <div className="recibo-nfe">
                <div className="t">NF-e</div>
                <div className="n">Nº {formatNumber(data.number)}</div>
                <div style={{ fontSize: "7px", marginTop: "2px" }}>SÉRIE: {serie}</div>
              </div>
            </div>

            {/* ════════ HEADER ════════ */}
            <div className="header">
              {/* Left: Company info */}
              <div className="h-logo">
                {data.logoUrl && <img src={data.logoUrl} alt="Logo" />}
                <div className="cn">{data.companyName}</div>
                <div className="ci">
                  {data.companyAddress}
                  {data.companyPhone && <><br />Fone: {data.companyPhone}</>}
                </div>
              </div>

              {/* Center: DANFE title */}
              <div className="h-danfe">
                <div className="title">DANFE</div>
                <div className="sub">Documento Auxiliar da<br />Nota Fiscal Eletrônica</div>
                <div className="es">
                  <span>0 - Entrada</span>
                  <div className="es-box">1</div>
                  <span>1 - Saída</span>
                </div>
                <div className="nnum">Nº {formatNumber(data.number)}</div>
                <div className="serie-label">SÉRIE: {serie}</div>
                <div className="page">Página 1 de 1</div>
              </div>

              {/* Right: Barcode + Access Key */}
              <div className="h-access">
                <div className="h-fisco">
                  <div className="fisco-lbl">CONTROLE DO FISCO</div>
                  <div className="barcode-area">
                    {data.accessKey ? (
                      <span className="barcode-text">{data.accessKey}</span>
                    ) : (
                      <span style={{ fontSize: "7px", color: "#999" }}>SEM CHAVE</span>
                    )}
                  </div>
                </div>
                <div className="h-key">
                  <div className="klbl">CHAVE DE ACESSO</div>
                  <div className="kval">
                    {data.accessKey ? formatAccessKey(data.accessKey) : "---"}
                  </div>
                  <div className="consult">
                    Consulta de autenticidade no portal nacional da<br />
                    NF-e www.nfe.fazenda.gov.br/portal ou no site<br />
                    da Sefaz Autorizadora
                  </div>
                </div>
              </div>
            </div>

            {/* ════════ NATUREZA DA OPERAÇÃO + PROTOCOLO ════════ */}
            <div className="row">
              <div className="cell b bt0" style={{ flex: 3 }}>
                <div className="lbl">Natureza da Operação</div>
                <div className="val">{data.natOp}</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: 2 }}>
                <div className="lbl">Protocolo de Autorização de Uso</div>
                <div className="val val-sm">{data.protocoloAutorizacao || ""}</div>
              </div>
            </div>

            {/* ════════ INSCRIÇÃO / CNPJ ════════ */}
            <div className="row">
              <div className="cell b bt0" style={{ flex: 2 }}>
                <div className="lbl">Inscrição Estadual</div>
                <div className="val">{data.companyIe || "ISENTO"}</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: 2 }}>
                <div className="lbl">Inscrição Estadual do Subst. Trib.</div>
                <div className="val">&nbsp;</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: 2 }}>
                <div className="lbl">CNPJ / CPF</div>
                <div className="val">{data.companyCnpj}</div>
              </div>
            </div>

            {/* ════════ DESTINATÁRIO / REMETENTE ════════ */}
            <div className="sec">Destinatário / Remetente</div>
            {/* Row 1: Nome, CNPJ, Data Emissão */}
            <div className="row">
              <div className="cell b bt0" style={{ flex: 5 }}>
                <div className="lbl">Nome / Razão Social</div>
                <div className="val">{data.destName}</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: 2 }}>
                <div className="lbl">CNPJ / CPF</div>
                <div className="val">{data.destDoc}</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: 1.5 }}>
                <div className="lbl">Data da Emissão</div>
                <div className="val val-sm">{data.emissionDate}</div>
              </div>
            </div>
            {/* Row 2: Endereço, Bairro, CEP, Data Entrada/Saída */}
            <div className="row">
              <div className="cell b bt0" style={{ flex: 4 }}>
                <div className="lbl">Endereço</div>
                <div className="val val-sm">{data.destAddress}</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: 2 }}>
                <div className="lbl">Bairro / Distrito</div>
                <div className="val val-sm">{data.destBairro || ""}</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: 1.2 }}>
                <div className="lbl">CEP</div>
                <div className="val">{data.destCep || ""}</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: 1.5 }}>
                <div className="lbl">Data de Entrada/Saída</div>
                <div className="val val-sm">{data.emissionDate}</div>
              </div>
            </div>
            {/* Row 3: Município, Fone, UF, IE, Hora */}
            <div className="row">
              <div className="cell b bt0" style={{ flex: 4 }}>
                <div className="lbl">Município</div>
                <div className="val">{data.destMunicipio || ""}</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: 2 }}>
                <div className="lbl">Fone / Fax</div>
                <div className="val val-sm">{data.destFone || ""}</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: "0 0 40px" }}>
                <div className="lbl">UF</div>
                <div className="val">{destUf}</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: 1.5 }}>
                <div className="lbl">Inscrição Estadual</div>
                <div className="val val-sm">{data.destIe || "ISENTO"}</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: 1.2 }}>
                <div className="lbl">Hora de Entrada/Saída</div>
                <div className="val val-sm">{data.emissionTime || ""}</div>
              </div>
            </div>

            {/* ════════ FATURA ════════ */}
            <div className="sec">Fatura</div>
            <div className="row">
              <div className="cell b bt0" style={{ flex: 1, minHeight: "14px" }}>
                <div className="val">&nbsp;</div>
              </div>
            </div>

            {/* ════════ CÁLCULO DO IMPOSTO ════════ */}
            <div className="sec">Cálculo do Imposto</div>
            <div className="row">
              <div className="cell b bt0" style={{ flex: 1 }}>
                <div className="lbl">Base de Cálculo do ICMS</div>
                <div className="val">{fmt(0)}</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: 1 }}>
                <div className="lbl">Valor do ICMS</div>
                <div className="val">{fmt(0)}</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: 1 }}>
                <div className="lbl">Base de Cálculo do ICMS ST</div>
                <div className="val">{fmt(0)}</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: 1 }}>
                <div className="lbl">Valor do ICMS ST</div>
                <div className="val">{fmt(0)}</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: 1 }}>
                <div className="lbl">Valor Total dos Produtos</div>
                <div className="val">{fmt(totalProd)}</div>
              </div>
            </div>
            <div className="row">
              <div className="cell b bt0" style={{ flex: 1 }}>
                <div className="lbl">Valor do Frete</div>
                <div className="val">{fmt(0)}</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: 1 }}>
                <div className="lbl">Valor do Seguro</div>
                <div className="val">{fmt(0)}</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: 1 }}>
                <div className="lbl">Desconto</div>
                <div className="val">{fmt(totalDesc)}</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: 1 }}>
                <div className="lbl">Outras Despesas Acessórias</div>
                <div className="val">{fmt(0)}</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: 1 }}>
                <div className="lbl">Valor do IPI</div>
                <div className="val">{fmt(0)}</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: 1 }}>
                <div className="lbl">Valor Total da Nota</div>
                <div className="val">{fmt(totalNota)}</div>
              </div>
            </div>

            {/* ════════ TRANSPORTADOR / VOLUMES ════════ */}
            <div className="sec">Transportador / Volumes Transportados</div>
            {/* Row 1 */}
            <div className="row">
              <div className="cell b bt0" style={{ flex: 3 }}>
                <div className="lbl">Razão Social</div>
                <div className="val">{data.transportName || ""}</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: 1 }}>
                <div className="lbl">Frete por Conta</div>
                <div className="val val-sm">{FRETE_LABELS[data.frete] || data.frete}</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: 1 }}>
                <div className="lbl">Código ANTT</div>
                <div className="val">{data.transportAntt || ""}</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: 1 }}>
                <div className="lbl">Placa do Veículo</div>
                <div className="val">{data.transportPlaca || ""}</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: "0 0 35px" }}>
                <div className="lbl">UF</div>
                <div className="val">{data.transportPlacaUf || ""}</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: 1 }}>
                <div className="lbl">CNPJ / CPF</div>
                <div className="val">{data.transportCnpj || ""}</div>
              </div>
            </div>
            {/* Row 2: Endereço, Município, UF, IE */}
            <div className="row">
              <div className="cell b bt0" style={{ flex: 4 }}>
                <div className="lbl">Endereço</div>
                <div className="val val-sm">{data.transportAddress || ""}</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: 2 }}>
                <div className="lbl">Município</div>
                <div className="val">{data.transportMunicipio || ""}</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: "0 0 35px" }}>
                <div className="lbl">UF</div>
                <div className="val">{data.transportUf || ""}</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: 1.5 }}>
                <div className="lbl">Inscrição Estadual</div>
                <div className="val">{data.transportIe || ""}</div>
              </div>
            </div>
            {/* Row 3: Volumes */}
            <div className="row">
              <div className="cell b bt0" style={{ flex: 1 }}>
                <div className="lbl">Quantidade</div>
                <div className="val">{data.volQtd || ""}</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: 1 }}>
                <div className="lbl">Espécie</div>
                <div className="val">{data.volEspecie || ""}</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: 2 }}>
                <div className="lbl">Marca</div>
                <div className="val">{data.volMarca || ""}</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: 1 }}>
                <div className="lbl">Numeração</div>
                <div className="val">{data.volNumeracao || ""}</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: 1 }}>
                <div className="lbl">Peso Bruto</div>
                <div className="val">{data.volPesoBruto || ""}</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: 1 }}>
                <div className="lbl">Peso Líquido</div>
                <div className="val">{data.volPesoLiquido || ""}</div>
              </div>
            </div>

            {/* ════════ DADOS DO PRODUTO / SERVIÇO ════════ */}
            <div className="sec">Dados do Produto / Serviço</div>
            <table className="items">
              <thead>
                <tr>
                  <th style={{ width: "7%" }}>CÓDIGO</th>
                  <th style={{ width: "25%" }}>DESCRIÇÃO DO PRODUTO/SERVIÇO</th>
                  <th style={{ width: "7%" }}>NCM/SH</th>
                  <th style={{ width: "5%" }}>CST</th>
                  <th style={{ width: "4%" }}>CFOP</th>
                  <th style={{ width: "4%" }}>UNID.</th>
                  <th style={{ width: "7%" }}>QTD.</th>
                  <th style={{ width: "8%" }}>VLR. UNIT.</th>
                  <th style={{ width: "8%" }}>VLR. TOTAL</th>
                  <th style={{ width: "7%" }}>BC ICMS</th>
                  <th style={{ width: "6%" }}>VLR. ICMS</th>
                  <th style={{ width: "5%" }}>VLR. IPI</th>
                  <th style={{ width: "4%" }}>ALÍQ.<br/>ICMS</th>
                  <th style={{ width: "4%" }}>ALÍQ.<br/>IPI</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item, idx) => {
                  const cstFull = `${item.origem.padStart(1, "0")}${item.cst}`;
                  const bcIcms = item.icmsAliquota > 0 ? item.total : 0;
                  const vlIcms = item.icmsAliquota > 0 ? Math.round(item.total * item.icmsAliquota) / 100 : 0;
                  return (
                    <tr key={idx}>
                      <td>{item.productCode || "—"}</td>
                      <td>{item.name}</td>
                      <td className="c">{item.ncm}</td>
                      <td className="c">{cstFull}</td>
                      <td className="c">{item.cfop}</td>
                      <td className="c">{item.unit}</td>
                      <td className="r">{fmtQty(item.qty)}</td>
                      <td className="r">{fmtQty(item.unitPrice)}</td>
                      <td className="r">{fmt(item.total)}</td>
                      <td className="r">{bcIcms > 0 ? fmt(bcIcms) : ""}</td>
                      <td className="r">{vlIcms > 0 ? fmt(vlIcms) : ""}</td>
                      <td className="r"></td>
                      <td className="r">{item.icmsAliquota > 0 ? fmt(item.icmsAliquota) : ""}</td>
                      <td className="r"></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* ════════ ISSQN ════════ */}
            <div className="sec">Cálculo do ISSQN</div>
            <div className="row">
              <div className="cell b bt0" style={{ flex: 1 }}>
                <div className="lbl">Inscrição Municipal</div>
                <div className="val">&nbsp;</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: 1 }}>
                <div className="lbl">Valor Total dos Serviços</div>
                <div className="val">&nbsp;</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: 1 }}>
                <div className="lbl">Base de Cálculo do ISSQN</div>
                <div className="val">&nbsp;</div>
              </div>
              <div className="cell b bt0 bl0" style={{ flex: 1 }}>
                <div className="lbl">Valor do ISSQN</div>
                <div className="val">&nbsp;</div>
              </div>
            </div>

            {/* ════════ DADOS ADICIONAIS ════════ */}
            <div className="sec">Dados Adicionais</div>
            <div className="info-row">
              <div className="info-col">
                <div className="ilbl">Informações Complementares</div>
                {data.infAdic || ""}
              </div>
              <div className="info-col">
                <div className="ilbl">Reservado ao Fisco</div>
              </div>
            </div>

            <div className="footer-text">
              Documento auxiliar da NF-e — Consulte a autenticidade em www.nfe.fazenda.gov.br
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
