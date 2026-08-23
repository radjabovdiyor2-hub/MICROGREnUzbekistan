'use client';

import { useState } from 'react';

import { STATUS_CONFIG } from './adminOrdersConfig';
import { AdminCheckbox } from './AdminCheckbox';
import { AdminSelectionBar } from './AdminSelectionBar';
import { useFeedback } from './AdminFeedback';
import type { Selection } from './useSelection';

// ══════════════════════════════════════════════════════════════════════
// Смена статуса пачке заказов.
//
// Владелец обрабатывает десятки заказов в день, а статус менялся по
// одному: открыть карточку, нажать, закрыть, открыть следующую. Утренняя
// пачка «подтвердить всё, что пришло за ночь» занимала столько нажатий,
// сколько было заказов.
//
// Вынесено из AdminOrders: с массовыми действиями экран перерос 200 строк.
// ══════════════════════════════════════════════════════════════════════

/**
 * Что можно назначить пачкой.
 *
 * Только движение вперёд по цепочке и отмена. Массового «вернуть в
 * ожидание» здесь нет намеренно: откат десятка заказов разом в работе не
 * встречается, а промахом стоит уведомлений клиентам, которые не отозвать.
 */
const BULK_STATUSES = [
  { id: 'CONFIRMED', label: 'Подтвердить' },
  { id: 'PREPARING', label: 'Готовится' },
  { id: 'DELIVERING', label: 'В пути' },
  { id: 'DELIVERED', label: 'Доставлен' },
  { id: 'CANCELLED', label: 'Отменить' },
];

export function AdminOrdersBulk({ pick, visibleIds, total, onDone }: {
  pick: Selection<string>;
  /** Заказы, видимые сейчас — с учётом вкладки статуса и страницы. */
  visibleIds: string[];
  total: number;
  onDone: () => void;
}) {
  const notify = useFeedback();
  const [busy, setBusy] = useState(false);

  /**
   * По одному и последовательно, а не пачкой параллельных запросов.
   *
   * Каждая смена статуса тянет уведомление клиенту, зеркало в CRM и — у
   * отмены — возврат товара на склад. Десяток одновременных PUT на слабой
   * сети даёт половину отказов, а половина отказов здесь означает половину
   * неотправленных уведомлений и половину невозвращённого товара.
   */
  const run = async (newStatus: string) => {
    if (!pick.count || busy) return;

    const label = STATUS_CONFIG[newStatus]?.label ?? newStatus;
    const agreed = await notify.confirm({
      title: `Сменить статус на «${label}» у ${pick.count} заказ(ов)?`,
      detail: 'Каждому клиенту уйдёт сообщение о новом статусе. Отменить отправку нельзя.',
      confirmText: 'Сменить',
      danger: newStatus === 'CANCELLED',
    });
    if (!agreed) return;

    const count = pick.count;
    setBusy(true);
    let failed = 0;

    for (const id of pick.ids) {
      try {
        const res = await fetch('/api/orders', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ id, status: newStatus }),
        });
        if (!res.ok) failed += 1;
      } catch {
        failed += 1;
      }
    }

    pick.clear();
    setBusy(false);
    onDone();

    // Число неудач, а не «что-то пошло не так»: владелец должен знать,
    // сколько заказов осталось со старым статусом.
    if (failed) {
      notify.error(`Не сменился статус у ${failed} из ${count} — остальные обновлены`);
    } else {
      notify.success(`Статус «${label}» у ${count} заказ(ов)`);
    }
  };

  const allSelected = pick.allSelected(visibleIds);

  return (
    <>
      {/* «Выбрать все видимые» — с учётом вкладки статуса: человек
          нажимает, глядя на отфильтрованный список перед собой. */}
      <label style={{
        display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 14,
        fontSize: 'var(--text-xs)', color: 'var(--text-muted)', cursor: 'pointer',
      }}>
        <AdminCheckbox
          checked={allSelected}
          indeterminate={pick.count > 0}
          onChange={() => pick.toggleAll(visibleIds)}
          label="Выбрать все видимые заказы"
        />
        {allSelected ? 'Снять выбор со всех' : `Выбрать все (${total})`}
      </label>

      <AdminSelectionBar count={pick.count} onClear={pick.clear}>
        {BULK_STATUSES.map((s) => (
          <button
            key={s.id}
            type="button"
            className="btn btn-sm btn-ghost"
            disabled={busy}
            style={{ color: STATUS_CONFIG[s.id]?.color, display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => run(s.id)}
          >
            {STATUS_CONFIG[s.id]?.icon} {s.label}
          </button>
        ))}
      </AdminSelectionBar>
    </>
  );
}
