'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';

import { adminFetch } from '@/lib/adminClient';

import { useFeedback } from './AdminFeedback';

// ══════════════════════════════════════════════════════════════════════
// Снять объезд дня.
//
// ЧЕГО НЕ БЫЛО. Пересохранение плана его ЗАМЕНЯЕТ, а убрать целиком было
// нечем: пустой список сохранить нельзя — роут отвечает «план пуст, нечего
// сохранять». Отменённый выезд, заболевший сотрудник, назначили не тому —
// всё это обычные причины, и каждая упиралась в отсутствие кнопки: план
// висел на дне и на карте продавца до конца суток.
//
// СПРАШИВАЕМ, ЧЕЙ ИМЕННО. В дне бывает несколько планов, и «Удалить план?»
// не говорит, какой уберут. Имя в вопросе — это не вежливость: без него
// однажды снимут не тот.
//
// ОТМЕТКИ ВИЗИТОВ ОСТАЮТСЯ, и об этом сказано прямо: поездка, которая
// состоялась, не перестаёт быть фактом оттого, что план отменили.
// ══════════════════════════════════════════════════════════════════════

export function AdminVisitPlanDelete({
  date,
  assignee,
  lang,
}: {
  /** Дата плана `YYYY-MM-DD`. */
  date: string;
  /** Чей план. Пустая строка — ничей черновик. */
  assignee: string;
  lang: 'ru' | 'uz';
}) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);
  const notify = useFeedback();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const who = assignee || t('ничей план', 'egasiz reja');

  const remove = async () => {
    const agreed = await notify.confirm({
      title: t(`Снять объезд: ${who}?`, `Yoʻnalish olib tashlansinmi: ${who}?`),
      detail: t(
        'Список точек и товаров исчезнет. Отметки визитов, если человек уже съездил, останутся.',
        'Nuqtalar va tovarlar roʻyxati oʻchadi. Tashriflar belgilari qoladi.',
      ),
      confirmText: t('Снять', 'Olib tashlash'),
      danger: true,
    });
    if (!agreed) return;

    setBusy(true);
    try {
      const res = await adminFetch(
        `/api/admin/visit-plans?date=${date}&assignee=${encodeURIComponent(assignee)}`,
        { method: 'DELETE' },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Не удалось снять');
      notify.success(t('Объезд снят', 'Yoʻnalish olib tashlandi'));
      queryClient.invalidateQueries({ queryKey: ['admin-visit-plans'] });
      queryClient.invalidateQueries({ queryKey: ['assigned-plan'] });
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Не получилось');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      disabled={busy}
      onClick={remove}
      aria-label={t('Снять объезд', 'Yoʻnalishni olib tashlash')}
      style={{ display: 'flex', alignItems: 'center', gap: 4, minHeight: 36 }}
    >
      <Trash2 size={14} />
    </button>
  );
}
