'use client';

import { CategoryLegend } from './CategoryLegend';
import { CustomerMapLegend } from './CustomerMapLegend';
import { CustomerMapPanel } from './CustomerMapPanel';
import { DayRoutePanel } from './DayRoutePanel';
import { DistrictBreakdown } from './DistrictBreakdown';
import { UnplacedTray } from './UnplacedTray';
import type { useCustomerMap } from './useCustomerMap';
import type { useDayRoute } from './useDayRoute';

// ══════════════════════════════════════════════════════════════════════
// Боковая колонка карты: панель точки, легенда, объезд, районы, лоток.
//
// Вынесена из AdminCustomerMap, когда та перешагнула 200 строк. Здесь
// только разметка и связывание двух состояний — карты и объезда; ни одно
// решение не принимается.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  lang: 'ru' | 'uz';
  m: ReturnType<typeof useCustomerMap>;
  route: ReturnType<typeof useDayRoute>;
  onOpenCard: (id: number) => void;
}

export function MapSidebar({ lang, m, route, onOpenCard }: Props) {
  const { placed, total, unplaced } = m.collection.summary;
  const selected = m.selected;

  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
      {selected && (
        <div className="admin-map-panel">
          <CustomerMapPanel
            point={selected}
            lang={lang}
            onClose={() => m.setSelectedId(null)}
            onOpenCard={onOpenCard}
            onReplacePin={(id) => {
              m.setPlacingId(id);
              m.setSelectedId(null);
            }}
            inRoute={route.has(selected.id)}
            onToggleRoute={() => {
              if (route.has(selected.id)) route.remove(selected.id);
              else
                route.add({
                  id: selected.id,
                  name: selected.name,
                  latitude: selected.latitude,
                  longitude: selected.longitude,
                });
            }}
          />
        </div>
      )}

      {/* Легенда объясняет ТЕКУЩУЮ раскраску. Показывать состояния отношений,
          когда точки покрашены по типу заведения, значит подписывать карту
          цветами, которых на ней нет. */}
      {m.mode === 'category' ? (
        <CategoryLegend features={m.visible.features} lang={lang} />
      ) : (
        <CustomerMapLegend
          summary={m.collection.summary}
          lang={lang}
          active={m.states}
          onToggle={m.toggleState}
        />
      )}

      <DayRoutePanel
        lang={lang}
        stops={route.stops}
        from={route.from}
        onRemove={route.remove}
        onMove={route.move}
        onSort={route.sort}
        onClear={route.clear}
        onPick={(stop) =>
          m.focusPoint({ id: stop.id, longitude: stop.longitude, latitude: stop.latitude })
        }
      />

      <DistrictBreakdown
        districts={m.collection.summary.districts}
        lang={lang}
        active={m.district}
        onSelect={m.setDistrict}
      />

      <UnplacedTray
        items={m.queue}
        lang={lang}
        placingId={m.placingId}
        onPlace={m.setPlacingId}
        onCancelPlacing={() => m.setPlacingId(null)}
        onRefresh={() => m.refetch()}
        chaining={m.chaining}
        onStartChain={m.startChain}
        onStopChain={m.stopChain}
      />

      {unplaced > 0 && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          {lang === 'ru' ? `На карте ${placed} из ${total}` : `Xaritada ${total} dan ${placed} ta`}
        </div>
      )}
    </div>
  );
}
