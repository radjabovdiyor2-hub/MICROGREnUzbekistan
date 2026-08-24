'use client';

import { useQueryClient } from '@tanstack/react-query';

import { PosSaleSheet } from '../PosSaleSheet';
import { markVisit, type VisitQueueLike } from './markVisit';

// ══════════════════════════════════════════════════════════════════════
// Касса, открытая с точки на карте.
//
// Вынесена из CustomerMapPanel: та переросла двести строк, а продажа с
// выезда — отдельная история со своими последствиями, и держать её внутри
// карточки значит смешивать «показать клиента» и «пробить чек».
//
// ПРОДАЖА — ЭТО И ЕСТЬ ВИЗИТ. Требовать после чека ещё одно нажатие «съездил»
// значило бы терять историю поездок ровно на самых удачных заездах: человек
// продал, обрадовался, закрыл — и поездка не записалась.
// ══════════════════════════════════════════════════════════════════════

export function PointSale({
  point,
  phone,
  lang,
  sellerName,
  visitQueue,
  onClose,
}: {
  point: { id: number; name: string };
  phone: string | null;
  lang: 'ru' | 'uz';
  sellerName: string;
  visitQueue: VisitQueueLike;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  return (
    <PosSaleSheet
      customer={{ id: point.id, name: point.name, phone }}
      lang={lang}
      sellerName={sellerName}
      origin="field"
      onClose={onClose}
      onSold={(result) => {
        // В заметке НЕТ суммы: ленту обращений продавец видит целиком, и
        // сумма в ней обошла бы маскировку денег на карте.
        const note = result.saleNumber ? `Продажа ${result.saleNumber}` : 'Продажа (без связи)';

        // Место у этой отметки спросит сам markVisit — тем же способом, что
        // и у кнопок «съездил». Подтверждение продажи на выезде важнее
        // прочих: именно её проще всего приписать себе, не выходя из дома.
        void markVisit({ customerId: point.id, type: 'visit_deal', note }, visitQueue).catch(
          (err) => console.error('Визит после продажи не отмечен:', err),
        );

        queryClient.invalidateQueries({ queryKey: ['admin-customers-map'] });
        queryClient.invalidateQueries({ queryKey: ['admin-customer', point.id] });
      }}
    />
  );
}
