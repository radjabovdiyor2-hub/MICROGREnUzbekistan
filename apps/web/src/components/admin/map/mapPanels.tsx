'use client';

import { CategoryLegend } from './CategoryLegend';
import { CustomerMapLegend } from './CustomerMapLegend';
import { MapKinds } from './MapKinds';
import { useFieldPeople } from './useFieldPeople';
import { CustomerMapPanel } from './CustomerMapPanel';
import { DistrictBreakdown } from './DistrictBreakdown';
import { MapCoverage } from './MapCoverage';
import { NearbyList } from './NearbyList';
import { UnplacedTray } from './UnplacedTray';
import type { useCustomerMap } from './useCustomerMap';
import type { useDayRoute } from './useDayRoute';

// ══════════════════════════════════════════════════════════════════════
// Панели карты, собранные один раз на два места.
//
// Колонка объезда живёт отдельно (`RoutePanel.tsx`): этот файл упирался в
// потолок в 200 строк, а панелей в ней стало четыре.
//
// Одни и те же панели живут в боковой колонке (обычный режим) и в доке
// (полный экран). Связывание у них нетривиальное — легенда зависит от
// режима раскраски, объезд от двух состояний сразу, — и повторять его
// дважды значило бы завести две версии, которые разойдутся на первой же
// правке. Разошлись бы молча: обе компилируются.
// ══════════════════════════════════════════════════════════════════════

export interface PanelDeps {
  lang: 'ru' | 'uz';
  m: ReturnType<typeof useCustomerMap>;
  route: ReturnType<typeof useDayRoute>;
}

/**
 * Легенда объясняет ТЕКУЩУЮ раскраску. Показывать состояния отношений,
 * когда точки покрашены по типу заведения, значит подписывать карту
 * цветами, которых на ней нет.
 */
export function LegendPanel({ lang, m, route }: PanelDeps) {
  // Слои читаются из тех же источников, что и рисуются: подпись, взятая из
  // отдельного состояния, однажды разойдётся с картой и будет объяснять то,
  // чего на ней нет.
  const people = useFieldPeople();
  const kinds = (
    <MapKinds
      lang={lang}
      hasProspects={m.showProspects}
      hasRoute={route.stops.length > 0}
      hasDelivery={m.delivery !== null}
      peopleCount={people?.length ?? 0}
    />
  );

  if (m.mode === 'category') {
    return (
      <>
        <CategoryLegend features={m.visible.features} lang={lang} />
        {kinds}
      </>
    );
  }
  return (
    <>
      <CustomerMapLegend
        summary={m.collection.summary}
        lang={lang}
        active={m.states}
        onToggle={m.toggleState}
      />
      {kinds}
    </>
  );
}

export function DistrictsPanel({ lang, m }: Omit<PanelDeps, 'route'>) {
  return (
    <>
      <DistrictBreakdown
        districts={m.collection.summary.districts}
        lang={lang}
        active={m.district}
        onSelect={m.setDistrict}
      />
      <MapCoverage coverage={m.collection.summary.coverage} lang={lang} />
    </>
  );
}

export function TrayPanel({
  lang,
  m,
  isOwner,
}: Omit<PanelDeps, 'route'> & { isOwner: boolean }) {
  return (
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
      isOwner={isOwner}
      loading={m.isLoading && m.collection.features.length === 0}
    />
  );
}

/**
 * Карточка выбранной точки вместе с соседями.
 *
 * Соседи идут отдельным блоком ПОД карточкой, а не внутри неё: это
 * разговор уже не про выбранного клиента, а про то, что вокруг него.
 */
export function PointPanel({
  lang,
  m,
  route,
  onOpenCard,
  sellerName,
  embedded = false,
  isOwner = false,
}: PanelDeps & {
  onOpenCard: (id: number) => void;
  sellerName: string;
  /** Внутри листа дока: заголовок и крестик там уже свои. */
  embedded?: boolean;
  /** Удаление точки — только владельцу. */
  isOwner?: boolean;
}) {
  const selected = m.selected;
  if (!selected) return null;

  return (
    <>
      <CustomerMapPanel
        point={selected}
        embedded={embedded}
        isOwner={isOwner}
        lang={lang}
        sellerName={sellerName}
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

      <NearbyList
        lang={lang}
        origin={selected}
        features={m.visible.features}
        inRoute={route.has}
        onAddRoute={(point) =>
          route.add({
            id: point.id,
            name: point.name,
            latitude: point.latitude,
            longitude: point.longitude,
          })
        }
        onPick={(id) => m.setSelectedId(id)}
      />
    </>
  );
}
