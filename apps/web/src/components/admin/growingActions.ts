import { CROP_DB, type Batch } from './growingData';

export async function harvestBatchApi(
  batch: Batch,
  patchBatch: (id: string, patch: Record<string, unknown>) => Promise<void>,
) {
  if (batch.productId) {
    const qty = batch.harvestQty || batch.trays;
    const res = await fetch('/api/inventory/movements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: batch.productId,
        type: 'IN',
        quantity: qty,
        reason: 'Урожай с посадки',
        note: `${(CROP_DB[batch.cropType] || CROP_DB['other']).nameRu}, ${batch.trays} лотков, посев ${batch.seedDate}`,
        costPrice: batch.costPrice || 0,
        performedBy: 'Посадки',
      }),
    });
    const data = await res.json();
    if (data.success) {
      alert(`✅ +${qty} шт «${batch.productName}» добавлено на склад! Остаток: ${data.newStock}`);
    } else {
      alert(`Ошибка: ${data.error}`);
    }
  }
  await patchBatch(batch.id, {
    harvestQty: batch.harvestQty || batch.trays,
    productId: batch.productId,
    productName: batch.productName,
    costPrice: batch.costPrice,
  });
}

export async function writeOffBatchApi(
  batch: Batch,
  patchBatch: (id: string, patch: Record<string, unknown>) => Promise<void>,
  fmt: (n: number) => string,
) {
  const qty = batch.harvestQty || batch.trays;
  const loss = (batch.costPrice || 0) * qty;
  if (!confirm(`Списать партию? Убыток: ${fmt(loss)} сум`)) return;

  if (batch.productId) {
    await fetch('/api/inventory/movements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: batch.productId,
        type: 'WRITE_OFF',
        quantity: qty,
        reason: 'Просрочка посадки',
        note: `${(CROP_DB[batch.cropType] || CROP_DB['other']).nameRu}, ${batch.trays} лотков, посев ${batch.seedDate}. Убыток: ${fmt(loss)} сум`,
        costPrice: batch.costPrice || 0,
        performedBy: 'Посадки (списание)',
      }),
    });
  }
  await patchBatch(batch.id, {
    harvestQty: qty,
    productId: batch.productId,
    productName: batch.productName,
    costPrice: batch.costPrice,
    note: (batch.note ? batch.note + ' | ' : '') + `СПИСАНО, убыток ${fmt(loss)}`,
  });
  alert(`❌ Списано. Убыток: ${fmt(loss)} сум`);
}
