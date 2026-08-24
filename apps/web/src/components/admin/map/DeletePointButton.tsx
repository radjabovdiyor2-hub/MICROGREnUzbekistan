'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';

import { useFeedback } from '../AdminFeedback';

// ══════════════════════════════════════════════════════════════════════
// Убрать карточку прямо с карты.
//
// ЗАЧЕМ. Заведения закрываются, переезжают и заводятся дважды — а увидеть
// это можно только на карте, стоя перед пустым помещением. До сих пор
// приходилось запоминать название, уходить в список клиентов и искать его
// там; на телефоне это три экрана и поиск по памяти.
//
// ТОЛЬКО ВЛАДЕЛЬЦУ. Удаление — единственное необратимое действие на карте, и
// оно остаётся за тем, кто отвечает за базу. Продавец вместо этого правит
// пин или заводит рядом новую карточку: обе операции обратимы.
//
// СЕРВЕР ОТКАЗЫВАЕТ, ЕСЛИ БЫЛИ ЗАКАЗЫ, и это не проверка «на всякий
// случай»: на `crm_orders` держится вся история продаж и все отчёты офиса.
// Здесь мы такой отказ не прячем за «что-то пошло не так», а пересказываем
// человеку целиком — он объясняет, ПОЧЕМУ нельзя, и это ответ на его
// вопрос, а не сообщение об ошибке.
// ══════════════════════════════════════════════════════════════════════

export function DeletePointButton({
  id,
  name,
  lang,
  onDeleted,
}: {
  id: number;
  name: string;
  lang: 'ru' | 'uz';
  /** Точки больше нет — панель должна закрыться. */
  onDeleted: () => void;
}) {
  const notify = useFeedback();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    const agreed = await notify.confirm({
      title: lang === 'ru' ? `Удалить «${name}»?` : `«${name}» oʻchirilsinmi?`,
      detail:
        lang === 'ru'
          ? 'Вместе с карточкой уйдут её обращения и напоминания. Если у клиента были заказы, удалить не получится — история продаж останется целой.'
          : 'Kartochka bilan birga murojaatlar va eslatmalar ham oʻchadi.',
      confirmText: lang === 'ru' ? 'Удалить' : 'Oʻchirish',
      danger: true,
    });
    if (!agreed) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/admin/customers?id=${id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!res.ok) throw new Error(body?.error || 'Не удалось удалить');

      notify.success(body?.message || 'Карточка удалена');
      queryClient.invalidateQueries({ queryKey: ['admin-customers-map'] });
      onDeleted();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Не удалось удалить');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className="btn btn-sm btn-ghost"
      disabled={busy}
      onClick={() => void remove()}
      style={{ color: 'var(--error)' }}
    >
      <Trash2 size={14} /> {lang === 'ru' ? 'Удалить' : 'Oʻchirish'}
    </button>
  );
}
