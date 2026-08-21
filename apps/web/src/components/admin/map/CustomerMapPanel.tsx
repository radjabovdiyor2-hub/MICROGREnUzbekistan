'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, MapPin, Phone, Plus, RefreshCw } from 'lucide-react';

import type { CustomerCard } from '@/lib/customers/card';
import {
  SEGMENT_META,
  computeSegment,
  computeTrend,
  explainSegment,
} from '@/lib/customers/segments';

import { CustomerMapPanelHead } from './CustomerMapPanelHead';
import { CustomerMapPanelStats } from './CustomerMapPanelStats';
import { CustomerOrdersSparkline } from './CustomerOrdersSparkline';
import { NavigateButton } from './NavigateButton';
import { VisitButtons } from './VisitButtons';
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
  /** Уже в объезде на сегодня. */
  inRoute: boolean;
  onToggleRoute: () => void;
}

const label = {
  orders: { ru: 'Заказов', uz: 'Buyurtmalar' },
  spent: { ru: 'Потрачено', uz: 'Sarflangan' },
  rhythm: { ru: 'Ритм заказов за полгода', uz: 'Yarim yillik buyurtma ritmi' },
  card: { ru: 'Открыть карточку', uz: 'Kartani ochish' },
  pin: { ru: 'Переставить пин', uz: 'Pinni koʻchirish' },
  loading: { ru: 'Загрузка истории…', uz: 'Tarix yuklanmoqda…' },
  manual: { ru: 'Пин поставлен вручную', uz: 'Pin qoʻlda qoʻyilgan' },
  addRoute: { ru: 'В объезд', uz: 'Yoʻnalishga' },
  inRoute: { ru: 'В объезде', uz: 'Yoʻnalishda' },
};

export function CustomerMapPanel({
  point,
  lang,
  onClose,
  onOpenCard,
  onReplacePin,
  inRoute,
  onToggleRoute,
}: Props) {
  const { data, isLoading } = useQuery<CustomerCard, Error>({
    queryKey: ['admin-customer', point.id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/customers?id=${point.id}`);
      if (!res.ok) throw new Error('Не удалось загрузить карточку');
      return (await res.json()).customer;
    },
  });

  const meta = SEGMENT_META[point.state];

  // Точка знает телефон сразу; карточка — запасной путь для случая, когда
  // точка пришла из старого кэша без этого поля.
  const raw = point.phone ?? data?.phone ?? null;
  const phone = raw && raw !== '—' ? raw : null;

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
      <CustomerMapPanelHead point={point} lang={lang} onClose={onClose} />

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

      {/* Навигация и звонок — первыми и крупными: это то, ради чего в поле
          вообще открывают точку. Остальное ниже и мельче. */}
      <NavigateButton latitude={point.latitude} longitude={point.longitude} lang={lang} />

      {/* Телефон берём из точки, а не из карточки: карточка догружается
          отдельным запросом, и в подвале ресторана кнопка «позвонить»
          появлялась через несколько секунд после нажатия. */}
      {phone && (
        <a className="btn btn-secondary" href={`tel:${phone}`} style={{ minHeight: 44 }}>
          <Phone size={16} /> {phone}
        </a>
      )}

      <button
        type="button"
        className={inRoute ? 'btn btn-secondary' : 'btn btn-ghost'}
        onClick={onToggleRoute}
        style={{ minHeight: 44 }}
      >
        {inRoute ? <Check size={16} /> : <Plus size={16} />}
        {inRoute ? label.inRoute[lang] : label.addRoute[lang]}
      </button>

      <VisitButtons
        customerId={point.id}
        lang={lang}
        lastVisitDays={point.lastVisitDays}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => onOpenCard(point.id)}>
          {label.card[lang]}
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => onReplacePin(point.id)}>
          <MapPin size={14} /> {label.pin[lang]}
        </button>
      </div>
    </div>
  );
}
