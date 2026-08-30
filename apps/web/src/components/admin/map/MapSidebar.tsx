'use client';

import { DistrictsPanel, LegendPanel, PointPanel, RoutePanel, TrayPanel } from './mapPanels';
import { MapFoldable } from './MapFoldable';
import type { useCustomerMap } from './useCustomerMap';
import type { useDayRoute } from './useDayRoute';

// ══════════════════════════════════════════════════════════════════════
// Боковая колонка карты: панель точки, легенда, объезд, районы, лоток.
//
// Сами панели и их связывание — в mapPanels.tsx: те же самые показывает
// док в полноэкранном режиме, и держать их в двух местах значило бы
// однажды поправить только одно.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  lang: 'ru' | 'uz';
  m: ReturnType<typeof useCustomerMap>;
  route: ReturnType<typeof useDayRoute>;
  isOwner: boolean;
  onOpenCard: (id: number) => void;
  /** Кем подписывать чек, пробитый прямо с точки. */
  sellerName: string;
}

export function MapSidebar({ lang, m, route, onOpenCard, isOwner, sellerName }: Props) {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
      {m.selected && (
        <div className="admin-map-panel">
          <PointPanel
            isOwner={isOwner}
            lang={lang}
            m={m}
            route={route}
            onOpenCard={onOpenCard}
            sellerName={sellerName}
          />
        </div>
      )}

      {/* Каждая панель сворачивается и помнит своё состояние: развёрнутые
          все разом, они давали метр прокрутки справа от карты, а на
          телефоне — простыню под ней. Лоток «без пина» сворачивается сам
          (UnplacedTray), поэтому второй обёртки ему не даём. */}
      <MapFoldable
        title={lang === 'ru' ? 'Легенда' : 'Izoh'}
        storageKey="mg-map-fold-legend"
      >
        <LegendPanel lang={lang} m={m} />
      </MapFoldable>

      <MapFoldable
        title={lang === 'ru' ? 'Объезд дня' : 'Kun yoʻnalishi'}
        storageKey="mg-map-fold-route"
        hint={route.stops.length > 0 ? String(route.stops.length) : undefined}
      >
        <RoutePanel lang={lang} m={m} route={route} />
      </MapFoldable>

      <MapFoldable
        title={lang === 'ru' ? 'Районы и покрытие' : 'Tumanlar va qamrov'}
        storageKey="mg-map-fold-districts"
        // Разрез по районам — вопрос «где мы ещё не были», его задают
        // раз в неделю, а не каждое утро. Свёрнут по умолчанию.
        defaultOpen={false}
      >
        <DistrictsPanel lang={lang} m={m} />
      </MapFoldable>

      <TrayPanel lang={lang} m={m} isOwner={isOwner} />
    </div>
  );
}
