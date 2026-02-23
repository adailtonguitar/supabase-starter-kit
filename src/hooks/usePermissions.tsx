export function usePermissions() {
  const canEdit = (_module: string) => true;
  return { role: "admin" as string, permissions: [] as string[], maxDiscountPercent: 100, canEdit };
}
