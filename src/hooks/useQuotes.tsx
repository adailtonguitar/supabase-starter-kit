export function useQuotes({ skipInitialFetch }: { skipInitialFetch?: boolean } = {}) {
  const createQuote = async (_data: any) => {
    console.warn("[useQuotes] createQuote not implemented");
  };

  const updateQuoteStatus = async (_id: string, _status: string) => {
    console.warn("[useQuotes] updateQuoteStatus not implemented");
  };

  return { createQuote, updateQuoteStatus, quotes: [], loading: false };
}
