// ══════════════════════════════════════════════════════════════════════
// Средневзвешенная себестоимость — одна формула на сырьё и на готовый товар.
//
// Вынесена отдельной чистой функцией намеренно: это единственное правило, по
// которому в системе появляется себестоимость, и оно должно проверяться
// тестом без базы. Приход сырья (rawMaterials) и приход урожая (growBatch)
// зовут именно её, а не считают каждый по-своему.
//
//     новая = (остаток × старая + приход × цена) / (остаток + приход)
//
// Было 1 кг по 50 000, купили 1 кг по 70 000 → 60 000/кг.
// ══════════════════════════════════════════════════════════════════════

export function weightedAverageCost(
  stockBefore: number,
  costBefore: number,
  incomingQty: number,
  incomingCost: number,
): number {
  const total = stockBefore + incomingQty;
  // Остаток был нулевым (или ушёл в ноль) — новая цена и есть цена закупки.
  // Делить на ноль не приходится, и «унаследованная» цена от пустого склада
  // не тянется в расчёт.
  if (total <= 0) return incomingCost;
  return (stockBefore * costBefore + incomingQty * incomingCost) / total;
}

/** Себестоимость единицы урожая: всё, что вложено в партию, делить на выход. */
export function unitCostOfHarvest(batchCost: number, harvestQty: number): number {
  if (harvestQty <= 0) return 0;
  return batchCost / harvestQty;
}
