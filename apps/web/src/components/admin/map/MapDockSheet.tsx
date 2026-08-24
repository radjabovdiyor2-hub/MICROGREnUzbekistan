'use client';

import { X } from 'lucide-react';

import { MapFilterRibbons } from './MapFilterRibbons';
import { chipStyle } from './mapChrome';
import { DistrictsPanel, LegendPanel, PointPanel, RoutePanel, TrayPanel } from './mapPanels';
import type { DockTab } from './MapDock';
import type { useCustomerMap } from './useCustomerMap';
import type { useDayRoute } from './useDayRoute';
import { useSwipeDown } from './useSwipeDown';

// ══════════════════════════════════════════════════════════════════════
// Лист дока: панель, которую поднимает вкладка полосы или выбранная точка.
//
// Вынесен из MapDock, когда там появились жест и кнопка выхода: экран
// перевалил за двести строк, а бар и лист меняются по разным поводам.
//
// ЗАКРЫВАЕТСЯ ТРЕМЯ СПОСОБАМИ, и это не роскошь. Крестик — для точного
// нажатия, смахивание вниз — то, что на телефоне пробуют первым, Escape —
// для тех, кто открыл админку с клавиатурой. Владелец сказал прямо:
// «нет кнопок назад и свайпов и жестов», — и был прав, до этого закрытие
// жило только в крестике 16×16.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  lang: 'ru' | 'uz';
  m: ReturnType<typeof useCustomerMap>;
  route: ReturnType<typeof useDayRoute>;
  isOwner: boolean;
  onOpenCard: (id: number) => void;
  sellerName: string;
  /** Открытая вкладка либо null — тогда в листе карточка выбранной точки. */
  tab: DockTab | null;
  title: string;
  onClose: () => void;
}

export function MapDockSheet({
  lang,
  m,
  route,
  isOwner,
  onOpenCard,
  sellerName,
  tab,
  title,
  onClose,
}: Props) {
  const swipe = useSwipeDown(onClose);

  return (
    <div className="admin-map-dock-sheet">
      {/* Шапка — она же область жеста. Смахивание ловим здесь, а не на всём
          листе: внутри панели прокручиваются, и жест закрытия спорил бы с
          прокруткой на первом же движении пальца вниз. */}
      <div className="admin-map-dock-sheet-head" {...swipe}>
        {/* Полоска-ухватка: без неё смахивание есть, но о нём никто не
            догадывается. Это единственная подсказка, что лист можно
            смахнуть, и стоит она четырёх пикселей высоты. */}
        <span className="admin-map-dock-grab" aria-hidden="true" />

        <span style={{ flex: 1, fontWeight: 'var(--font-semibold)' }}>{title}</span>

        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={onClose}
          aria-label={lang === 'ru' ? 'Закрыть' : 'Yopish'}
          style={{ minWidth: 44 }}
        >
          <X size={16} />
        </button>
      </div>

      <div className="admin-map-dock-sheet-body">
        {tab === 'filters' && (
          <>
            <MapFilterRibbons lang={lang} m={m} isOwner={isOwner} chip={chipStyle} />
            <DistrictsPanel lang={lang} m={m} />
          </>
        )}
        {tab === 'legend' && <LegendPanel lang={lang} m={m} />}
        {tab === 'route' && <RoutePanel lang={lang} m={m} route={route} />}
        {tab === 'tray' && <TrayPanel lang={lang} m={m} isOwner={isOwner} />}
        {tab === null && (
          <PointPanel
            isOwner={isOwner}
            embedded
            lang={lang}
            m={m}
            route={route}
            onOpenCard={onOpenCard}
            sellerName={sellerName}
          />
        )}
      </div>
    </div>
  );
}

