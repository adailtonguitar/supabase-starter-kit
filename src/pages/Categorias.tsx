import { Tags, FileText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CrudPage, type FieldConfig } from "@/components/cadastro/CrudPage";
import { useProductCategories, useCreateProductCategory, useUpdateProductCategory, useDeleteProductCategory } from "@/hooks/useProductCategories";
import { useFiscalCategories, useCreateFiscalCategory, useUpdateFiscalCategory, useDeleteFiscalCategory } from "@/hooks/useFiscalCategories";

const productFields: FieldConfig[] = [
  { key: "name", label: "Nome", required: true, showInTable: true, colSpan: 2 },
  { key: "description", label: "Descrição", type: "textarea", showInTable: true, colSpan: 2 },
];

const fiscalFields: FieldConfig[] = [
  { key: "name", label: "Nome", required: true, showInTable: true },
  { key: "regime", label: "Regime", type: "select", required: true, showInTable: true, options: [
    { value: "simples_nacional", label: "Simples Nacional" },
    { value: "lucro_presumido", label: "Lucro Presumido" },
    { value: "lucro_real", label: "Lucro Real" },
  ]},
  { key: "operation_type", label: "Tipo Operação", type: "select", required: true, showInTable: true, options: [
    { value: "interna", label: "Interna" },
    { value: "interestadual", label: "Interestadual" },
  ]},
  { key: "product_type", label: "Tipo Produto", type: "select", required: true, showInTable: true, options: [
    { value: "normal", label: "Normal" },
    { value: "st", label: "Substituição Tributária" },
  ]},
  { key: "cfop", label: "CFOP", required: true, showInTable: true },
  { key: "ncm", label: "NCM", showInTable: true },
  { key: "cest", label: "CEST" },
  { key: "csosn", label: "CSOSN" },
  { key: "cst_icms", label: "CST ICMS" },
  { key: "icms_rate", label: "Alíq. ICMS (%)", type: "number", showInTable: true },
  { key: "icms_st_rate", label: "Alíq. ICMS-ST (%)", type: "number" },
  { key: "mva", label: "MVA (%)", type: "number" },
  { key: "pis_rate", label: "Alíq. PIS (%)", type: "number" },
  { key: "cofins_rate", label: "Alíq. COFINS (%)", type: "number" },
  { key: "ipi_rate", label: "Alíq. IPI (%)", type: "number" },
];

export default function Categorias() {
  const { data: products = [], isLoading: loadingProducts } = useProductCategories();
  const createProduct = useCreateProductCategory();
  const updateProduct = useUpdateProductCategory();
  const delProduct = useDeleteProductCategory();

  const { data: fiscals = [], isLoading: loadingFiscals } = useFiscalCategories();
  const createFiscal = useCreateFiscalCategory();
  const updateFiscal = useUpdateFiscalCategory();
  const delFiscal = useDeleteFiscalCategory();

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <h1 className="text-2xl font-bold text-foreground">Categorias</h1>
      <Tabs defaultValue="produto">
        <TabsList>
          <TabsTrigger value="produto" className="gap-1.5">
            <Tags className="w-4 h-4" /> Produto
          </TabsTrigger>
          <TabsTrigger value="fiscal" className="gap-1.5">
            <FileText className="w-4 h-4" /> Fiscal
          </TabsTrigger>
        </TabsList>
        <TabsContent value="produto">
          <CrudPage
            title="Categorias de Produto"
            icon={<Tags className="w-5 h-5" />}
            data={products}
            isLoading={loadingProducts}
            fields={productFields}
            onCreate={(d) => createProduct.mutateAsync(d as any)}
            onUpdate={(d) => updateProduct.mutateAsync(d as any)}
            onDelete={(id) => delProduct.mutateAsync(id)}
            searchKeys={["name", "description"]}
          />
        </TabsContent>
        <TabsContent value="fiscal">
          <CrudPage
            title="Categorias Fiscais"
            icon={<FileText className="w-5 h-5" />}
            data={fiscals}
            isLoading={loadingFiscals}
            fields={fiscalFields}
            onCreate={(d) => createFiscal.mutateAsync(d as any)}
            onUpdate={(d) => updateFiscal.mutateAsync(d as any)}
            onDelete={(id) => delFiscal.mutateAsync(id)}
            searchKeys={["name", "cfop", "regime"]}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
