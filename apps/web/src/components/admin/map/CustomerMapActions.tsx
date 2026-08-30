'use client';

import { Check, MapPin, Phone, Plus, ShoppingCart } from 'lucide-react';

import { NavigateButton } from './NavigateButton';
import { DeletePointButton } from './DeletePointButton';
import { VisitButtons } from './VisitButtons';
import { VisitScheduleButtons } from './VisitScheduleButtons';
import type { useVisitQueue } from './useVisitQueue';
import { type PointView } from './mapFeature';

// ══════════════════════════════════════════════════════════════════════
// Что можно сделать с точкой: доехать, позвонить, продать, отметить.
//
// Вынесено из CustomerMapPanel, когда к панели добавилась касса и файл
// перешагнул 200 строк.
//
// Порядок кнопок — это порядок поездки, а не алфавит: доехал, позвонил на
// месте, продал, отметил. Продажа стоит сразу за навигацией и звонком,
// потому что ради неё в поле и выезжают; карточка и пин — мелкими внизу,
// это работа за столом.
// ══════════════════════════════════════════════════════════════════════

const label = {
  card: { ru: 'Открыть карточку', uz: 'Kartani ochish' },
  pin: { ru: 'Переставить пин', uz: 'Pinni koʻchirish' },
  manual: { ru: 'Пин поставлен вручную', uz: 'Pin qoʻlda qoʻyilgan' },
  addRoute: { ru: 'В объезд', uz: 'Yoʻnalishga' },
  inRoute: { ru: 'В объезде', uz: 'Yoʻnalishda' },
  sell: { ru: 'Продать', uz: 'Sotish' },
};

export function CustomerMapActions({
  point, lang, phone, inRoute, visitQueue, onToggleRoute, onSell, onOpenCard, onReplacePin,
  isOwner, onDeleted,
}: {
  point: PointView;
  lang: 'ru' | 'uz';
  /** Телефон точки, уже очищенный от прочерка. */
  phone: string | null;
  inRoute: boolean;
  visitQueue: ReturnType<typeof useVisitQueue>;
  onToggleRoute: () => void;
  onSell: () => void;
  onOpenCard: (id: number) => void;
  onReplacePin: (id: number) => void;
  /** Удаление — только владельцу: единственное необратимое здесь. */
  isOwner: boolean;
  onDeleted: () => void;
}) {
  return (
    <>
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

      {/* Касса открывается здесь же, а не на другой вкладке: уйти в
          «Продажи» значит потерять карту с маршрутом и искать клиента
          поиском заново — при том, что он уже выбран. */}
      <button type="button" className="btn btn-primary" onClick={onSell} style={{ minHeight: 48 }}>
        <ShoppingCart size={16} /> {label.sell[lang]}
      </button>

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
        queue={visitQueue}
      />

      {/* Регулярность заезда — рядом с отметкой визита, а не в настройках:
          «к этому по субботам» решают, глядя на клиента, и в отдельный
          экран за этим не пойдут. */}
      <VisitScheduleButtons customerId={point.id} lang={lang} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => onOpenCard(point.id)}>
          {label.card[lang]}
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => onReplacePin(point.id)}>
          <MapPin size={14} /> {label.pin[lang]}
        </button>
        {/* Закрылось, переехало или завелось дважды — видно только
            здесь, на карте. Продавцу вместо удаления доступна
            перестановка пина: она обратима. */}
        {isOwner && (
          <DeletePointButton
            id={point.id}
            name={point.name}
            lang={lang}
            onDeleted={onDeleted}
          />
        )}
      </div>
    </>
  );
}
