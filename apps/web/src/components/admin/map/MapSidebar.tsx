'use client';

import { DistrictsPanel, LegendPanel, PointPanel, RoutePanel, TrayPanel } from './mapPanels';
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

      <LegendPanel lang={lang} m={m} />
      <RoutePanel lang={lang} m={m} route={route} />
      <DistrictsPanel lang={lang} m={m} />
      <TrayPanel lang={lang} m={m} isOwner={isOwner} />
    </div>
  );
}
