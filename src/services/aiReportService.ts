import { supabase } from "@/integrations/supabase/client";

export interface AIReportResult {
  report: string;
  source?: string;
  data_summary?: {
    sales_count: number;
    products_count: number;
    clients_count: number;
    period: string;
  };
}

export interface AIReportError {
  error: string;
  data_summary?: {
    sales_count: number;
    products_count: number;
    clients_count: number;
    period: string;
  };
}

/**
 * Calls the generate-ai-report Edge Function with real data.
 * Uses the authenticated user's JWT token for authorization.
 */
export async function generateAIReport(
  companyId: string,
  startDate: string,
  endDate: string
): Promise<AIReportResult> {
  const { data, error } = await supabase.functions.invoke("generate-ai-report", {
    body: {
      company_id: companyId,
      start_date: startDate,
      end_date: endDate,
    },
  });

  if (error) {
    // Handle ReadableStream error responses
    let errorMessage = error.message || "Erro ao gerar relatório";
    if (error instanceof Response) {
      try {
        const errData = await error.json() as { error?: string };
        errorMessage = errData?.error || errorMessage;
      } catch { /* use default message */ }
    }
    throw new Error(errorMessage);
  }

  if (!data?.report) {
    throw new Error("Resposta inesperada: relatório não encontrado.");
  }

  return data as AIReportResult;
}
