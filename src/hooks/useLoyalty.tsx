export function useLoyalty() {
  return {
    earnPoints: async (_clientId: string, _total: number, _docId?: string) => 0,
    isActive: false,
  };
}
