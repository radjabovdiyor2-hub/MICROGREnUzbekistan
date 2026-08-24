'use client';

import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';

import type { CustomerCard } from '@/lib/customers/card';
import {
  SEGMENT_META,
  explainSegment,
} from '@/lib/customers/segments';

import { CustomerMapActions } from './CustomerMapActions';
import { pointInsights } from './pointInsights';
import { PointSale } from './PointSale';
import { VisitProofLine } from './VisitProofLine';
import { CustomerMapPanelHead } from './CustomerMapPanelHead';
import { CustomerMapPanelStats } from './CustomerMapPanelStats';
import { CustomerOrdersSparkline } from './CustomerOrdersSparkline';
import { useAdminBack } from '../useAdminBack';
import { useVisitQueue } from './useVisitQueue';
import { type PointView } from './mapFeature';

// ══════════════════════════════════════════════════════════════════════
// Панель клиента по клику на точку.
//
// История заказов не приходит вместе с картой — она подтягивается сюда
// лениво тем же запросом, что и карточка клиента в списке, и с тем же
// ключом кэша. Открыть клиента с карты и из таблицы — это один запрос,
// а не два одинаковых.
//
// У панели два состояния: сама точка и касса на ней. Касса открывается
// прямо здесь, а не на вкладке «Продажи»: уход туда стоил бы карты с
// маршрутом и повторного поиска уже выбранного клиента.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  point: PointView;
  lang: 'ru' | 'uz';
  /** Кем подписывать чек, пробитый с этой точки. */
  sellerName: string;
  onClose: () => void;
  onOpenCard: (id: number) => void;
  onReplacePin: (id: number) => void;
  /** Уже в объезде на сегодня. */
  inRoute: boolean;
  onToggleRoute: () => void;
  /**
   * Карточка уже лежит внутри чужой обёртки со своим заголовком —
   * в листе дока полноэкранного режима.
   *
   * Тогда своя шапка и своя плашка лишние: на телефоне выходило имя
   * заведения с крестиком ДВАЖДЫ подряд и рамка внутри рамки. Владелец
   * прислал снимок именно с этим.
   */
  embedded?: boolean;
}

const label = {
  rhythm: { ru: 'Ритм заказов за полгода', uz: 'Yarim yillik buyurtma ritmi' },
  loading: { ru: 'Загрузка истории…', uz: 'Tarix yuklanmoqda…' },
};

export function CustomerMapPanel({
  point,
  lang,
  sellerName,
  onClose,
  embedded = false,
  onOpenCard,
  onReplacePin,
  inRoute,
  onToggleRoute,
}: Props) {
  const [selling, setSelling] = useState(false);

  // Аппаратное «назад» в Telegram: из кассы — к точке, с точки — к карте.
  // Без перехвата первое же нажатие закрывало приложение целиком, и это
  // ровно тот экран, где им пользуются одной рукой на ходу.
  useAdminBack(useCallback(() => setSelling(false), []), selling);
  useAdminBack(onClose, !selling);

  // Очередь отметок одна на панель: её делят кнопки «Съездил — отметь» и
  // автоматическая отметка после продажи. Два экземпляра разбирали бы одно
  // хранилище наперегонки и отправили бы отметку дважды.
  const visitQueue = useVisitQueue();

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

  // Уточнённое состояние и переход за месяц — см. pointInsights.
  const { segment, trend } = pointInsights(data);

  // Касса с точки живёт отдельно — см. PointSale.
  if (selling) {
    return (
      <PointSale
        point={point}
        phone={phone}
        lang={lang}
        sellerName={sellerName}
        visitQueue={visitQueue}
        onClose={() => setSelling(false)}
      />
    );
  }

  return (
    <div
      className={embedded ? undefined : 'card'}
      style={{
        padding: embedded ? 0 : 'var(--space-4)',
        display: 'grid',
        gap: 'var(--space-3)',
      }}
    >
      <CustomerMapPanelHead point={point} lang={lang} onClose={onClose} embedded={embedded} />

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

      {/* Чем подтверждена последняя поездка — см. VisitProofLine. */}
      {data?.lastVisit && <VisitProofLine visit={data.lastVisit} lang={lang} />}

      <CustomerMapActions
        point={point}
        lang={lang}
        phone={phone}
        inRoute={inRoute}
        visitQueue={visitQueue}
        onToggleRoute={onToggleRoute}
        onSell={() => setSelling(true)}
        onOpenCard={onOpenCard}
        onReplacePin={onReplacePin}
      />
    </div>
  );
}
