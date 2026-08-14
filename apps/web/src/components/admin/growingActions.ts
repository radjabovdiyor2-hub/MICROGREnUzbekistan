import { type Batch } from './growingData';

// ══════════════════════════════════════════════════════════════════════
// Сбор и списание партии.
//
// Раньше сбор урожая делался ДВУМЯ несвязанными запросами из браузера:
// сначала POST движения склада, потом PATCH партии. Ни транзакции, ни
// защиты от повтора: двойной клик приходовал урожай дважды, а сбой между
// запросами оставлял товар на складе при несобранной партии.
//
// Теперь обе операции — один PATCH. Приход на склад, себестоимость единицы
// и пересчёт средней цены товара делает сервер, одной транзакцией.
// ══════════════════════════════════════════════════════════════════════

async function patchBatchOperation(
  body: Record<string, unknown>,
): Promise<{ ok: boolean; message: string }> {
  const res = await fetch('/api/admin/grow-batches', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, message: data.error || 'Не удалось выполнить операцию' };
  }
  return { ok: true, message: '', ...data };
}

export async function harvestBatchApi(
  batch: Batch,
  refresh: () => void | Promise<void>,
  fmt: (n: number) => string,
) {
  const qty = batch.harvestQty || batch.trays;
  const result = await patchBatchOperation({
    id: batch.id,
    harvestQty: qty,
    productId: batch.productId,
    productName: batch.productName,
  });

  if (!result.ok) {
    alert(`❌ ${result.message}`);
    return;
  }

  const saved = (result as { batch?: { costPrice?: number } }).batch;
  const unitCost = saved?.costPrice ?? 0;
  alert(
    batch.productId
      ? `✅ Собрано ${qty} «${batch.productName}». Себестоимость единицы: ${fmt(Math.round(unitCost))} сум`
      : `✅ Урожай зафиксирован (${qty}). Товар не привязан — на склад ничего не оприходовано.`,
  );
  await refresh();
}

/**
 * Досрочно открыть партию или продлить темноту.
 *
 * Фаза считается из дат, поэтому «открыть» — это поставить партии столько
 * тёмных дней, сколько она реально прожила. Норма культуры при этом остаётся
 * прежней: всходы зависят от партии семян и температуры, и одна ранняя партия
 * ещё не повод править справочник. Если факт разошёлся с нормой — спрашиваем.
 */
export async function setDarkPhaseApi(
  batch: Batch,
  mode: 'open' | 'extend',
  refresh: () => void | Promise<void>,
) {
  const result = await patchBatchOperation({
    id: batch.id,
    action: mode === 'extend' ? 'extend_dark' : 'open_dark',
  });
  if (!result.ok) {
    alert(`❌ ${result.message}`);
    return;
  }

  const data = result as unknown as {
    actualDarkDays?: number;
    normDarkDays?: number | null;
    cropNameRu?: string;
  };
  await refresh();

  if (mode !== 'open') return;
  const actual = data.actualDarkDays;
  const norm = data.normDarkDays;
  if (typeof actual !== 'number' || typeof norm !== 'number' || actual === norm) return;

  const agreed = confirm(
    `Партия вышла из темноты за ${actual} дн., а в норме культуры «${data.cropNameRu}» стоит ${norm}.\n\n` +
      `Поставить ${actual} дн. нормой — чтобы следующие посадки считались правильно?`,
  );
  if (!agreed) return;

  // PATCH, а не POST: POST — полный upsert справочника, и запрос из двух
  // полей обнулил бы расход семян, субстрат и выход.
  const res = await fetch('/api/admin/crop-norms', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ cropType: batch.cropType, darkDays: actual }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    // Норму правит только владелец: агроному сюда закрыто, и это не ошибка.
    alert(`⚠️ Норму не изменил: ${body?.error || 'нет доступа'}`);
    return;
  }
  alert(`✅ Норма культуры «${data.cropNameRu}»: ${actual} дн. в темноте.`);
}

export async function writeOffBatchApi(
  batch: Batch,
  refresh: () => void | Promise<void>,
  fmt: (n: number) => string,
) {
  // Убыток — настоящий: это всё, что вложено в партию (семена + расходники).
  // Раньше он считался как costPrice × количество, а costPrice при посадке не
  // сохранялся — поэтому на экране всегда стоял «убыток 0 сум».
  const loss = batch.batchCost ?? 0;
  if (!confirm(`Списать партию? Убыток: ${fmt(Math.round(loss))} сум`)) return;

  const result = await patchBatchOperation({ id: batch.id, action: 'write_off' });
  if (!result.ok) {
    alert(`❌ ${result.message}`);
    return;
  }
  alert(`❌ Списано. Убыток: ${fmt(Math.round(loss))} сум`);
  await refresh();
}
