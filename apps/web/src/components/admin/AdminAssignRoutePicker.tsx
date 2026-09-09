'use client';

import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { useState } from 'react';

import { adminFetch } from '@/lib/adminClient';

// ══════════════════════════════════════════════════════════════════════
// Кого поставить в объезд.
//
// ЧТО БЫЛО СЛОМАНО. Выбирать можно было ТОЛЬКО из тех, у кого уже стоит
// регулярное расписание на этот день недели. У большинства заведений его
// нет, и владелец видел пустой список с подписью «на этот день никого не
// назначено» — то есть назначить объезд было нельзя вовсе, пока не
// заведёшь расписание на карточке каждого клиента. Именно так функция и
// не работала.
//
// РАСПИСАНИЕ ОСТАЁТСЯ ПОДСКАЗКОЙ, а не рамкой: «к этому по субботам» уже
// сказано, и повторять это руками незачем. Но рядом теперь поиск по всей
// базе — разовый заезд, новый клиент, замена заболевшего.
//
// ВЫБРАННОЕ ВСЕГДА СВЕРХУ И ВСЕГДА ВИДНО. Иначе отмеченный через поиск
// клиент исчезал бы из глаз при следующем запросе, и человек не понимал
// бы, сколько точек в объезде.
// ══════════════════════════════════════════════════════════════════════

export interface PickCustomer {
  id: number;
  name: string;
  district?: string | null;
}

interface Found {
  id: number;
  name: string;
  companyName: string | null;
  district: string | null;
}

export function AdminAssignRoutePicker({
  scheduled,
  picked,
  lang,
  onToggle,
}: {
  /** Кто стоит по расписанию на этот день недели. Подсказка, не рамка. */
  scheduled: PickCustomer[];
  /** Отмеченные точки: id → как показать. */
  picked: Map<number, PickCustomer>;
  lang: 'ru' | 'uz';
  onToggle: (customer: PickCustomer) => void;
}) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);
  const [query, setQuery] = useState('');

  const { data: found = [], isFetching } = useQuery<Found[]>({
    queryKey: ['assign-route-search', query],
    // Короткий запрос выдаёт полбазы и ничего не проясняет.
    enabled: query.trim().length >= 2,
    queryFn: async () => {
      const res = await adminFetch(
        `/api/admin/customers?q=${encodeURIComponent(query.trim())}&limit=20`,
      );
      if (!res.ok) throw new Error('Не удалось найти');
      const body = await res.json();
      return Array.isArray(body?.customers) ? body.customers : [];
    },
  });

  const row = (customer: PickCustomer, key: string) => (
    <label
      key={key}
      style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', minHeight: 36 }}
    >
      <input
        type="checkbox"
        checked={picked.has(customer.id)}
        onChange={() => onToggle(customer)}
      />
      <span style={{ flex: 1 }}>
        {customer.name}
        {customer.district && (
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
            {' · '}
            {customer.district}
          </span>
        )}
      </span>
    </label>
  );

  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
      {picked.size > 0 && (
        <div style={{ display: 'grid', gap: 'var(--space-1)' }}>
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
            {t('В объезде', 'Yoʻnalishda')}
            {' · '}
            <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>{picked.size}</span>
          </div>
          {[...picked.values()].map((customer) => (
            <div
              key={`picked-${customer.id}`}
              style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', minHeight: 32 }}
            >
              <span style={{ flex: 1 }}>{customer.name}</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => onToggle(customer)}
                aria-label={t('Убрать из объезда', 'Yoʻnalishdan olib tashlash')}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gap: 'var(--space-1)' }}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
          {t('Кто по расписанию на этот день', 'Bu kunga jadval boʻyicha')}
          {' · '}
          <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>{scheduled.length}</span>
        </div>
        {scheduled.length === 0 ? (
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            {t(
              'На этот день недели регулярных заездов нет — добавьте точки поиском ниже.',
              'Bu kunga muntazam tashriflar yoʻq — quyidagi qidiruv orqali qoʻshing.',
            )}
          </div>
        ) : (
          scheduled.map((customer) => row(customer, `sched-${customer.id}`))
        )}
      </div>

      <label style={{ display: 'grid', gap: 4 }}>
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Search size={14} /> {t('Добавить любого клиента', 'Boshqa mijoz qoʻshish')}
        </span>
        <input
          className="input"
          value={query}
          placeholder={t('Название, телефон или адрес', 'Nomi, telefon yoki manzil')}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      {query.trim().length >= 2 && (
        <div style={{ display: 'grid', gap: 'var(--space-1)' }}>
          {isFetching && (
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              {t('Ищу…', 'Qidirilmoqda…')}
            </span>
          )}
          {!isFetching && found.length === 0 && (
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              {t('Никого не нашлось', 'Hech kim topilmadi')}
            </span>
          )}
          {found.map((customer) =>
            row(
              {
                id: customer.id,
                name: customer.companyName || customer.name,
                district: customer.district,
              },
              `found-${customer.id}`,
            ),
          )}
        </div>
      )}
    </div>
  );
}
