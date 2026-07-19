export const DEFAULT_UNIT_COST = 4000;

export function computeOrder(copies: number, unitPrice: number, unitCost: number = DEFAULT_UNIT_COST) {
  const revenue = copies * unitPrice;
  const cost = copies * unitCost;
  const margin = revenue - cost;
  return { revenue, cost, margin };
}
