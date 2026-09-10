'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { useState } from 'react';

import { adminFetch, adminJsonArray } from '@/lib/adminClient';
import type { RoutePoint } from '@/lib/customers/dayRoute';
import { formatLocalDate } from '@/lib/localDate';

import { useFeedback } from '../AdminFeedback';
import type { AssignEmployee } from '../assignRouteTypes';

// ══════════════════════════════════════════════════════════════════════
// Назначить объезд прямо с карты.
//
// ЗАЧЕМ ЗДЕСЬ, ЕСЛИ ЕСТЬ ЭКРАН ДНЯ. Владелец собирает объезд глазами по
// карте: видит, кто рядом, кого давно не было, где дыра в покрытии. Он уже
// натыкал точки — и на этом упирался в стену: чтобы назначить их человеку,
// надо было уйти на другой экран и набрать тот же список заново, но уже
// поиском по названиям. Второй набор того же — это не «ещё один способ»,
// это способ ошибиться.
//
// НАЗНАЧАЕТ ТОЛЬКО ВЛАДЕЛЕЦ. Продавцу кнопка не показывается: свой объезд
// он сохраняет себе кнопкой автоплана, а раздавать чужие дни ему нечем и
// незачем. Рубеж всё равно стоит на сервере — здесь мы просто не
// показываем то, что всё равно не сработает.
//
// ДАТА ЕСТЬ, И ЭТО НЕ МЕЛОЧЬ. «Поставь Азизу на субботу» — обычная
// просьба, а объезд с карты умел появляться только на сегодня.
// ══════════════════════════════════════════════════════════════════════

const text = {
  title: { ru: 'Назначить объезд', uz: 'Yoʻnalish tayinlash' },
  who: { ru: '— кому —', uz: '— kimga —' },
  send: { ru: 'Назначить', uz: 'Tayinlash' },
  sending: { ru: 'Назначаю…', uz: 'Tayinlanmoqda…' },
  noTelegram: {
    ru: 'Telegram не привязан — уведомление не придёт, скажите сами',
    uz: 'Telegram ulanmagan — bildirishnoma bormaydi',
  },
  failed: { ru: 'Не получилось', uz: 'Boʻlmadi' },
};

/**
 * Уже есть ли у человека объезд на эту дату.
 *
 * ЗАЧЕМ СПРАШИВАТЬ. Сохранение плана его ЗАМЕНЯЕТ — один план на человека
 * в день, так стоит уникальность в базе. Назначить второй раз значит молча
 * стереть первый: список точек, порядок и список товаров. Владелец при
 * этом ничего не заметит, а продавец утром откроет чужой день.
 *
 * Ошибку проверки глотаем намеренно: не смогли спросить — не мешаем
 * назначить. Предупреждение это удобство, а не рубеж; рубеж стоит на
 * сервере и решает, кому вообще можно писать.
 */
async function existingStops(date: string, assignee: string): Promise<number> {
  try {
    const res = await adminFetch(
      `/api/admin/visit-plans?date=${date}&assignee=${encodeURIComponent(assignee)}`,
    );
    if (!res.ok) return 0;
    const body = await res.json();
    const plans: { stops?: unknown[] }[] = Array.isArray(body?.plans) ? body.plans : [];
    return plans.reduce((sum, plan) => sum + (plan.stops?.length ?? 0), 0);
  } catch {
    return 0;
  }
}

export function AssignRouteFromMap({
  lang,
  stops,
  onAssigned,
}: {
  lang: 'ru' | 'uz';
  /** Точки, набранные на карте. Пусто — кнопки нет. */
  stops: RoutePoint[];
  /** Объезд ушёл человеку — на карте его держать больше незачем. */
  onAssigned: () => void;
}) {
  const t = (key: keyof typeof text) => text[key][lang];
  const notify = useFeedback();
  const queryClient = useQueryClient();

  const [assignee, setAssignee] = useState('');
  const [date, setDate] = useState(() => formatLocalDate());
  const [busy, setBusy] = useState(false);

  const { data: employees = [] } = useQuery<AssignEmployee[]>({
    queryKey: ['employees-list'],
    queryFn: () => adminJsonArray<AssignEmployee>('/api/inventory/employees'),
  });

  if (stops.length === 0) return null;

  const chosen = employees.find((e) => e.name === assignee) ?? null;
  const unreachable = chosen !== null && !chosen.telegramId;

  const assign = async () => {
    if (!assignee || busy) return;

    // Спрашиваем ДО отправки: после неё прежний день уже не вернуть.
    const already = await existingStops(date, assignee);
    if (already > 0) {
      const ok = await notify.confirm({
        title:
          lang === 'ru'
            ? `У ${assignee} уже есть объезд на ${date} — ${already} точек. Заменить?`
            : `${assignee}da ${date} uchun yoʻnalish bor (${already}). Almashtirilsinmi?`,
        detail:
          lang === 'ru'
            ? 'Прежний список точек и товаров исчезнет. Отметки визитов, если он уже съездил, останутся.'
            : 'Avvalgi roʻyxat oʻchadi. Tashriflar belgilari qoladi.',
        confirmText: lang === 'ru' ? 'Заменить' : 'Almashtirish',
        danger: true,
      });
      if (!ok) return;
    }

    setBusy(true);
    try {
      const res = await adminFetch('/api/admin/visit-plans', {
        method: 'POST',
        body: JSON.stringify({
          date,
          assignee,
          customerIds: stops.map((s) => s.id),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || t('failed'));

      notify.success(
        unreachable
          ? `${assignee}: ${stops.length}. ${t('noTelegram')}`
          : `${assignee}: ${stops.length}`,
      );
      queryClient.invalidateQueries({ queryKey: ['admin-visit-plans'] });
      queryClient.invalidateQueries({ queryKey: ['assigned-plan'] });
      // Список на карте очищаем: он уже не «мой объезд», а чужое задание,
      // и оставлять его здесь значит однажды назначить его второй раз.
      onAssigned();
      setAssignee('');
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t('failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="card"
      style={{ padding: 'var(--space-3)', display: 'grid', gap: 'var(--space-2)' }}
    >
      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)' }}>
        {t('title')} · {stops.length}
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <select
          className="input"
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          style={{ flex: '1 1 140px', minHeight: 44 }}
        >
          <option value="">{t('who')}</option>
          {employees.map((e) => (
            <option key={e.id} value={e.name}>
              {e.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          className="input"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ flex: '0 1 150px', minHeight: 44 }}
        />
      </div>

      {unreachable && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
          {t('noTelegram')}
        </span>
      )}

      <button
        type="button"
        className="btn btn-primary"
        disabled={busy || assignee === ''}
        onClick={assign}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 }}
      >
        <Send size={14} /> {busy ? t('sending') : t('send')}
      </button>
    </div>
  );
}
