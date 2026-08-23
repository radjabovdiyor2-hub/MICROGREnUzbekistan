import { type Batch } from './growingData';
import { type ConfirmOptions } from './AdminFeedback';

/**
 * Как модуль разговаривает с человеком.
 *
 * Передаётся снаружи, а не берётся хуком: это обычный модуль, а не
 * компонент, и хуки в нём вызывать нельзя. Заодно его можно проверить
 * тестом, подсунув заглушку вместо экрана.
 *
 * Раньше здесь стояли семь `alert()` и два `confirm()` — нативные окна
 * браузера. Это самый частый поток агронома: теплица, телефон, одна рука.
 * В Telegram Mini App такое окно выезжает системным листом поверх
 * приложения и сбивает его хром.
 */
export interface GrowingNotify {
  toast: (text: string, variant?: 'success' | 'error' | 'warning' | 'info') => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

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
  notify: GrowingNotify,
) {
  const qty = batch.harvestQty || batch.trays;
  const result = await patchBatchOperation({
    id: batch.id,
    harvestQty: qty,
    productId: batch.productId,
    productName: batch.productName,
  });

  if (!result.ok) {
    notify.toast(result.message, 'error');
    return;
  }

  const saved = (result as { batch?: { costPrice?: number } }).batch;
  const unitCost = saved?.costPrice ?? 0;
  notify.toast(
    batch.productId
      ? `Собрано ${qty} «${batch.productName}». Себестоимость единицы: ${fmt(Math.round(unitCost))} сум`
      : `Урожай зафиксирован (${qty}). Товар не привязан — на склад ничего не оприходовано.`,
    // Урожай без привязанного товара — не успех: он никуда не попал.
    batch.productId ? 'success' : 'warning',
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
  notify: GrowingNotify,
) {
  const result = await patchBatchOperation({
    id: batch.id,
    action: mode === 'extend' ? 'extend_dark' : 'open_dark',
  });
  if (!result.ok) {
    notify.toast(result.message, 'error');
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

  const agreed = await notify.confirm({
    title: `Поставить ${actual} дн. нормой культуры «${data.cropNameRu}»?`,
    detail:
      `Партия вышла из темноты за ${actual} дн., а в норме стоит ${norm}.\n` +
      `Изменится расчёт следующих посадок этой культуры.`,
    confirmText: 'Поставить нормой',
  });
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
    notify.toast(`Норму не изменил: ${body?.error || 'нет доступа'}`, 'warning');
    return;
  }
  notify.toast(`Норма культуры «${data.cropNameRu}»: ${actual} дн. в темноте.`, 'success');
}

export async function writeOffBatchApi(
  batch: Batch,
  refresh: () => void | Promise<void>,
  fmt: (n: number) => string,
  notify: GrowingNotify,
) {
  // Убыток — настоящий: это всё, что вложено в партию (семена + расходники).
  // Раньше он считался как costPrice × количество, а costPrice при посадке не
  // сохранялся — поэтому на экране всегда стоял «убыток 0 сум».
  const loss = batch.batchCost ?? 0;
  const agreed = await notify.confirm({
    title: `Списать партию «${batch.productName || batch.cropType}»?`,
    detail: `Убыток: ${fmt(Math.round(loss))} сум. Вернуть партию нельзя.`,
    confirmText: 'Списать',
    danger: true,
  });
  if (!agreed) return;

  const result = await patchBatchOperation({ id: batch.id, action: 'write_off' });
  if (!result.ok) {
    notify.toast(result.message, 'error');
    return;
  }
  notify.toast(`Списано. Убыток: ${fmt(Math.round(loss))} сум`, 'warning');
  await refresh();
}
