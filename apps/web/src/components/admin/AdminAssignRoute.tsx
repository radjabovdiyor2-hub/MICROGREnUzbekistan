'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarPlus } from 'lucide-react';
import { useState } from 'react';

import { adminFetch, adminJsonArray } from '@/lib/adminClient';
import { weekdayLabel, isoWeekday } from '@/lib/customers/visitSchedule';

import { AdminNotice } from './AdminNotice';
import { AdminRouteGoods, type RouteGood } from './AdminRouteGoods';
import { useFeedback } from './AdminFeedback';

// ══════════════════════════════════════════════════════════════════════
// Назначить объезд сотруднику на дату.
//
// ЧЕГО НЕ БЫЛО. План умел появляться ровно одним способом: продавец
// собирал его себе на карте, кнопкой «Собрать план дня», и всегда на
// СЕГОДНЯ. Роут дату и исполнителя принимал, а прислать их было некому —
// то есть «поставь Азизу объезд на субботу» сделать было нельзя вовсе.
//
// ОТКУДА БЕРУТСЯ ТОЧКИ. Из расписания заездов на этот день недели: «к
// этому по субботам» уже сказано на карточке клиента, и повторять это
// списком незачем. Галочки сняты и поставлены руками — расписание
// подсказывает, а решает человек.
//
// СПИСОК ТОВАРОВ НЕОБЯЗАТЕЛЕН: объезд бывает развозной и разведочный.
// ══════════════════════════════════════════════════════════════════════

interface ScheduledRow {
  id: number;
  weekday: number;
  customer: { id: number; name: string | null; address: string | null; district: string | null };
}

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
  const [picked, setPicked] = useState<Set<number>>(new Set());
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

  const { data: employees = [] } = useQuery<{ id: string; name: string; role: string }[]>({
    queryKey: ['employees-list'],
    enabled: open,
    queryFn: () => adminJsonArray<{ id: string; name: string; role: string }>('/api/inventory/employees'),
  });

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

  const toggle = (customerId: number) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(customerId)) next.delete(customerId);
      else next.add(customerId);
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
          customerIds: [...picked],
          // Пустой массив шлём осознанно: «объезд без товаров» — это
          // решение, а не отсутствие ответа.
          items: goods.filter((g) => g.productId),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Не удалось назначить объезд');
      notify.success(t(`Объезд назначен: ${assignee}`, `Yoʻnalish tayinlandi: ${assignee}`));
      setOpen(false);
      setPicked(new Set());
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

      <div style={{ display: 'grid', gap: 'var(--space-1)' }}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
          {t('Кто по расписанию на этот день', 'Bu kunga jadval boʻyicha')}
          {' · '}
          <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>{rows.length}</span>
        </div>
        {rows.length === 0 ? (
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            {t(
              'На этот день недели никого не назначено. Расписание ставится на карточке клиента на карте — «Заезжать по дням».',
              'Bu kunga hech kim belgilanmagan.',
            )}
          </div>
        ) : (
          rows.map((row) => (
            <label key={row.id} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', minHeight: 36 }}>
              <input
                type="checkbox"
                checked={picked.has(row.customer.id)}
                onChange={() => toggle(row.customer.id)}
              />
              <span style={{ flex: 1 }}>
                {row.customer.name || `#${row.customer.id}`}
                {row.customer.district && (
                  <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                    {' · '}{row.customer.district}
                  </span>
                )}
              </span>
            </label>
          ))
        )}
      </div>

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
