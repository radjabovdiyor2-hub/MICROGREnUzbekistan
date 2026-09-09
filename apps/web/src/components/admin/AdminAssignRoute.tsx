'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarPlus } from 'lucide-react';
import { useState } from 'react';

import { adminFetch, adminJsonArray } from '@/lib/adminClient';
import { weekdayLabel, isoWeekday } from '@/lib/customers/visitSchedule';

import { AdminNotice } from './AdminNotice';
import { AdminAssignRoutePicker, type PickCustomer } from './AdminAssignRoutePicker';
import { AdminRouteGoods, type RouteGood } from './AdminRouteGoods';
import type { AssignEmployee, ScheduledRow } from './assignRouteTypes';
import { useFeedback } from './AdminFeedback';

// ══════════════════════════════════════════════════════════════════════
// Назначить объезд сотруднику на дату.
//
// ЧЕГО НЕ БЫЛО. План умел появляться ровно одним способом: продавец
// собирал его себе на карте, кнопкой «Собрать план дня», и всегда на
// СЕГОДНЯ. Роут дату и исполнителя принимал, а прислать их было некому —
// то есть «поставь Азизу объезд на субботу» сделать было нельзя вовсе.
//
// ОТКУДА БЕРУТСЯ ТОЧКИ. Расписание заездов на этот день недели —
// ПОДСКАЗКА, а не рамка: «к этому по субботам» уже сказано на карточке
// клиента. Рядом поиск по всей базе — иначе назначить объезд можно было
// только тем, у кого расписание уже заведено, а у большинства заведений
// его нет: список выходил пустым, и функция не работала вовсе.
//
// СПИСОК ТОВАРОВ НЕОБЯЗАТЕЛЕН: объезд бывает развозной и разведочный.
// ══════════════════════════════════════════════════════════════════════

export function AdminAssignRoute({ date, lang, onSaved }: {
  /** Дата объезда `YYYY-MM-DD` — та же, что выбрана на экране дня. */
  date: string;
  lang: 'ru' | 'uz';
  onSaved: () => void;
}) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);
  const notify = useFeedback();
  const [open, setOpen] = useState(false);
  const [assignee, setAssignee] = useState('');
  // Map, а не Set: выбранного через поиск клиента надо показать по имени,
  // а искать его заново в списке, которого уже нет на экране, нечем.
  const [picked, setPicked] = useState<Map<number, PickCustomer>>(new Map());
  const [goods, setGoods] = useState<RouteGood[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const weekday = isoWeekday(new Date(`${date}T00:00:00`));

  const { data: scheduled } = useQuery<{ items: ScheduledRow[] }>({
    queryKey: ['visit-schedules', date],
    enabled: open,
    queryFn: async () => {
      const res = await adminFetch(`/api/admin/visit-schedules?date=${date}`);
      if (!res.ok) throw new Error('Не удалось загрузить расписание');
      return res.json();
    },
  });

  const { data: employees = [] } = useQuery<AssignEmployee[]>({
    queryKey: ['employees-list'],
    enabled: open,
    queryFn: () => adminJsonArray<AssignEmployee>('/api/inventory/employees'),
  });

  // Кому назначаем — и достанем ли до него. Telegram у сотрудника может
  // быть не привязан, и тогда уведомление о плане молча никуда не уйдёт.
  const chosen = employees.find((e) => e.name === assignee) ?? null;
  const unreachable = chosen !== null && !chosen.telegramId;

  const { data: products = [] } = useQuery<{ id: string; nameRu: string }[]>({
    queryKey: ['products-list'],
    enabled: open,
    queryFn: async () => {
      const res = await fetch('/api/products?all=true&limit=300');
      const data = await res.json().catch(() => null);
      const list: unknown[] = Array.isArray(data?.items) ? data.items : [];
      return list.map((x) => {
        const p = x as { id: string; nameRu?: string; slug?: string };
        return { id: p.id, nameRu: p.nameRu || p.slug || p.id };
      });
    },
  });

  const rows = scheduled?.items ?? [];

  const toggle = (customer: PickCustomer) => {
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(customer.id)) next.delete(customer.id);
      else next.set(customer.id, customer);
      return next;
    });
  };

  const save = async () => {
    if (!assignee) { setError(t('Выберите сотрудника', 'Xodimni tanlang')); return; }
    if (picked.size === 0) { setError(t('Отметьте хотя бы одну точку', 'Kamida bitta nuqta')); return; }

    setBusy(true);
    setError('');
    try {
      const res = await adminFetch('/api/admin/visit-plans', {
        method: 'POST',
        body: JSON.stringify({
          date,
          assignee,
          customerIds: [...picked.keys()],
          // Пустой массив шлём осознанно: «объезд без товаров» — это
          // решение, а не отсутствие ответа.
          items: goods.filter((g) => g.productId),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Не удалось назначить объезд');
      // Говорим ПРАВДУ о том, узнает ли человек. Раньше здесь всегда было
      // «назначен», и владелец считал, что поручил работу, — а сотруднику
      // без привязанного Telegram не уходило ничего.
      notify.success(
        unreachable
          ? t(
              `Объезд назначен: ${assignee}. Скажите ему сами — Telegram не привязан.`,
              `Yoʻnalish tayinlandi: ${assignee}. Oʻzingiz ayting — Telegram ulanmagan.`,
            )
          : t(`Объезд назначен: ${assignee}`, `Yoʻnalish tayinlandi: ${assignee}`),
      );
      setOpen(false);
      setPicked(new Map());
      setGoods([]);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не получилось');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <CalendarPlus size={14} /> {t('Назначить объезд', 'Yoʻnalish tayinlash')}
      </button>
    );
  }

  return (
    <div className="card" style={{ padding: 'var(--space-4)', display: 'grid', gap: 'var(--space-3)' }}>
      <div style={{ fontWeight: 'var(--font-bold)' }}>
        {t('Объезд на', 'Yoʻnalish sanasi')} {date} · {weekdayLabel(weekday, lang)}
      </div>

      <AdminNotice>{error}</AdminNotice>

      <label style={{ display: 'grid', gap: 4 }}>
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{t('Кому', 'Kimga')}</span>
        <select className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">{t('— выберите сотрудника —', '— xodimni tanlang —')}</option>
          {employees.map((e) => <option key={e.id} value={e.name}>{e.name}</option>)}
        </select>
      </label>

      {unreachable && (
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
          {t(
            'У сотрудника не привязан Telegram — уведомление о плане он не получит. Назначить всё равно можно, но сказать придётся самому.',
            'Xodimga Telegram ulanmagan — bildirishnoma bormaydi. Tayinlash mumkin, lekin oʻzingiz aytishingiz kerak.',
          )}
        </div>
      )}

      <AdminAssignRoutePicker
        scheduled={rows.map((row) => ({
          id: row.customer.id,
          name: row.customer.name || `#${row.customer.id}`,
          district: row.customer.district,
        }))}
        picked={picked}
        lang={lang}
        onToggle={toggle}
      />

      <AdminRouteGoods items={goods} products={products} lang={lang} onChange={setGoods} />

      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <button className="btn btn-primary" disabled={busy} onClick={save}>
          {busy ? t('Назначаю…', 'Tayinlanmoqda…') : t('Назначить', 'Tayinlash')}
        </button>
        <button className="btn" disabled={busy} onClick={() => setOpen(false)}>
          {t('Отмена', 'Bekor qilish')}
        </button>
      </div>
    </div>
  );
}
