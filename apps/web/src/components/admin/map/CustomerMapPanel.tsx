'use client';

import { useQuery } from '@tanstack/react-query';
import { ExternalLink, MapPin, Phone, RefreshCw, X } from 'lucide-react';

import type { CustomerCard } from '@/lib/customers/card';
import {
  SEGMENT_META,
  computeSegment,
  computeTrend,
  explainSegment,
} from '@/lib/customers/segments';

import { CustomerMapPanelStats } from './CustomerMapPanelStats';
import { CustomerOrdersSparkline } from './CustomerOrdersSparkline';
import { type PointView } from './mapFeature';

// ══════════════════════════════════════════════════════════════════════
// Панель клиента по клику на точку.
//
// История заказов не приходит вместе с картой — она подтягивается сюда
// лениво тем же запросом, что и карточка клиента в списке, и с тем же
// ключом кэша. Открыть клиента с карты и из таблицы — это один запрос,
// а не два одинаковых.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  point: PointView;
  lang: 'ru' | 'uz';
  onClose: () => void;
  onOpenCard: (id: number) => void;
  onReplacePin: (id: number) => void;
}

const label = {
  orders: { ru: 'Заказов', uz: 'Buyurtmalar' },
  spent: { ru: 'Потрачено', uz: 'Sarflangan' },
  rhythm: { ru: 'Ритм заказов за полгода', uz: 'Yarim yillik buyurtma ritmi' },
  card: { ru: 'Открыть карточку', uz: 'Kartani ochish' },
  pin: { ru: 'Переставить пин', uz: 'Pinni koʻchirish' },
  route: { ru: 'Маршрут', uz: 'Marshrut' },
  loading: { ru: 'Загрузка истории…', uz: 'Tarix yuklanmoqda…' },
  manual: { ru: 'Пин поставлен вручную', uz: 'Pin qoʻlda qoʻyilgan' },
};

export function CustomerMapPanel({ point, lang, onClose, onOpenCard, onReplacePin }: Props) {
  const { data, isLoading } = useQuery<CustomerCard, Error>({
    queryKey: ['admin-customer', point.id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/customers?id=${point.id}`);
      if (!res.ok) throw new Error('Не удалось загрузить карточку');
      return (await res.json()).customer;
    },
  });

  const meta = SEGMENT_META[point.state];

  // Пересчитываем состояние по загруженной истории: у панели есть даты
  // заказов, которых нет у точки, и объяснение получается точнее.
  const segment = data
    ? computeSegment({
        lastOrderDate: data.lastOrderDate,
        firstOrderDate: data.orders.at(-1)?.createdAt ?? null,
        ordersCount: data.ordersCount,
        customerType: data.customerType,
      })
    : null;

  // Переход за последний месяц. Считается только здесь: нужны даты всех
  // заказов, которых у точки на карте нет.
  const trend = data
    ? computeTrend({
        orderDates: data.orders.map((o) => o.createdAt),
        customerType: data.customerType,
      })
    : null;

  return (
    <div className="card" style={{ padding: 'var(--space-4)', display: 'grid', gap: 'var(--space-3)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-lg)' }}>{point.name}</h3>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 4,
              padding: '2px 10px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--bg-tertiary)',
              fontSize: 'var(--text-xs)',
            }}
          >
            <span
              aria-hidden
              style={{ width: 8, height: 8, borderRadius: '50%', background: meta.token }}
            />
            {meta[lang]}
          </div>
        </div>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Закрыть">
          <X size={16} />
        </button>
      </div>

      <CustomerMapPanelStats point={point} trend={trend} lang={lang} />

      {/* Объяснение вместо ярлыка: ярлык говорит ЧТО, а это — ПОЧЕМУ,
          и владелец может проверить вывод глазами. */}
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: 0 }}>
        {explainSegment(
          segment ?? {
            state: point.state,
            cadenceDays: 0,
            daysSince: point.daysSinceLastOrder,
            overdueRatio: point.overdueRatio,
          },
          lang,
        )}
      </p>

      <div>
        <div
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            marginBottom: 'var(--space-1)',
          }}
        >
          {label.rhythm[lang]}
        </div>
        {isLoading ? (
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            <RefreshCw size={14} className="animate-spin" /> {label.loading[lang]}
          </div>
        ) : (
          <CustomerOrdersSparkline
            orders={(data?.orders ?? []).map((o) => ({ createdAt: o.createdAt, total: o.total }))}
            stateToken={meta.token}
          />
        )}
      </div>

      {point.geoSource === 'manual' && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--brand-accent)' }}>
          {label.manual[lang]}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <button type="button" className="btn btn-sm btn-primary" onClick={() => onOpenCard(point.id)}>
          {label.card[lang]}
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => onReplacePin(point.id)}>
          <MapPin size={14} /> {label.pin[lang]}
        </button>
        {data?.phone && data.phone !== '—' && (
          <a className="btn btn-sm btn-ghost" href={`tel:${data.phone}`}>
            <Phone size={14} /> {data.phone}
          </a>
        )}
        <a
          className="btn btn-sm btn-ghost"
          href={`https://2gis.uz/geo/${point.longitude},${point.latitude}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={14} /> {label.route[lang]}
        </a>
      </div>
    </div>
  );
}
