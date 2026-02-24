const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://fsvxpxziotklbxkivyug.supabase.co";
const ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzdnhweHppb3RrbGJ4a2l2eXVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODU5NTMsImV4cCI6MjA4NzM2MTk1M30.8I3ABsRZBZuE1IpK_g9z3PdRUd9Omt_F5qNx0Pgqvyo";

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
 * No mocks, no simulated data.
 */
export async function generateAIReport(
  companyId: string,
  startDate: string,
  endDate: string
): Promise<AIReportResult> {
  const url = `${SUPABASE_URL}/functions/v1/generate-ai-report`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ANON_KEY}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify({
      company_id: companyId,
      start_date: startDate,
      end_date: endDate,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const errorData = data as AIReportError;
    const errorMessage =
      errorData?.error || `Erro ${response.status}. Tente novamente.`;
    throw new Error(errorMessage);
  }

  if (!data?.report) {
    throw new Error("Resposta inesperada: relatório não encontrado.");
  }

  return data as AIReportResult;
}
