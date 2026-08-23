'use client';

import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';

import type { CustomerCard } from '@/lib/customers/card';
import {
  SEGMENT_META,
  computeSegment,
  computeTrend,
  explainSegment,
} from '@/lib/customers/segments';

import { CustomerMapActions } from './CustomerMapActions';
import { CustomerMapPanelHead } from './CustomerMapPanelHead';
import { CustomerMapPanelStats } from './CustomerMapPanelStats';
import { CustomerOrdersSparkline } from './CustomerOrdersSparkline';
import { PosSaleSheet } from '../PosSaleSheet';
import { useAdminBack } from '../useAdminBack';
import { markVisit } from './markVisit';
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
  onOpenCard,
  onReplacePin,
  inRoute,
  onToggleRoute,
}: Props) {
  const queryClient = useQueryClient();
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

  if (selling) {
    return (
      <PosSaleSheet
        customer={{ id: point.id, name: point.name, phone }}
        lang={lang}
        sellerName={sellerName}
        origin="field"
        onClose={() => setSelling(false)}
        onSold={(result) => {
          // Продажа — это и есть визит с исходом «договорились». Требовать
          // после чека ещё одно нажатие значило бы терять историю поездок
          // ровно на самых удачных заездах.
          //
          // В заметке НЕТ суммы: ленту обращений продавец видит целиком, и
          // сумма в ней обошла бы маскировку денег на карте.
          const note = result.saleNumber ? `Продажа ${result.saleNumber}` : 'Продажа (без связи)';
          void markVisit({ customerId: point.id, type: 'visit_deal', note }, visitQueue).catch(
            (err) => console.error('Визит после продажи не отмечен:', err),
          );
          queryClient.invalidateQueries({ queryKey: ['admin-customers-map'] });
          queryClient.invalidateQueries({ queryKey: ['admin-customer', point.id] });
        }}
      />
    );
  }

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
