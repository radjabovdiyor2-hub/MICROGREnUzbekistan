'use client';

import dynamic from 'next/dynamic';

import { CustomerMapToolbar } from './CustomerMapToolbar';

import { MapBanners } from './MapBanners';
import { AddCustomerHere } from './AddCustomerHere';
import { MapDock, type DockTab } from './MapDock';
import { MapSkeleton } from './MapSkeleton';
import { MapPointsHere } from './MapPointsHere';
import { MapSearch } from './MapSearch';
import { MapSidebar } from './MapSidebar';
import { MapStage } from './MapStage';
import { useState } from 'react';

import { useCustomerMap } from './useCustomerMap';
import { useDayRoute } from './useDayRoute';
import { useMapFullscreen } from './useMapFullscreen';
import { FILTERS_OPEN_KEY, useRememberedFlag } from './useMapPrefs';

// maplibre-gl трогает window прямо на импорте: без ssr:false падает сборка,
// а не страница. Тот же приём, что у LottieAnimation и ArViewer.
const CustomerMapCanvas = dynamic(() => import('./CustomerMapCanvas'), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

// ══════════════════════════════════════════════════════════════════════
// Карта клиентов: разметка. Вся механика — в useCustomerMap.
//
// Обвязка (шапка, плашки, боковая колонка) лежит в обычном потоке
// страницы, а сцена карты в полноэкранном режиме становится
// `position: fixed` поверх неё — то есть накрывает её сама, без условного
// рендера. Исключение одно: поиск, который в полноэкранном режиме обязан
// оказаться ПОВЕРХ карты, а не под ней.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  lang: 'ru' | 'uz';
  onOpenCard: (id: number) => void;
  /** Пакетный геокодер и правка карточки — только владельцу. */
  isOwner: boolean;
  /** Кем подписывать чек, пробитый прямо с точки. */
  sellerName: string;
}

export function AdminCustomerMap({ lang, onOpenCard, isOwner, sellerName }: Props) {
  const m = useCustomerMap();
  const route = useDayRoute();
  const [filtersOpen, setFiltersOpen] = useRememberedFlag(FILTERS_OPEN_KEY, true);
  // Открытая вкладка дока. Живёт здесь, а не в самом доке: от неё зависит,
  // выходит ли Escape из полноэкранного режима.
  const [dockTab, setDockTab] = useState<DockTab | null>(null);

  // Полный экран выходит по Escape только когда поверх карты не открыто
  // ничего своего: иначе одно нажатие закрывало бы сразу две вещи, и
  // человек терял бы не то, что собирался. Лестницу держит useCustomerMap.
  const full = useMapFullscreen(
    m.placingId === null &&
      m.selectedId === null &&
      m.stackIds.length === 0 &&
      dockTab === null,
  );

  const search = (
    <MapSearch
      lang={lang}
      query={m.query}
      onQuery={m.setQuery}
      matches={m.matches}
      onPick={(point) => {
        m.focusPoint(point);
        m.setQuery('');
      }}
      states={m.states}
      onStates={m.setStates}
    />
  );

  // В полноэкранном режиме поиск уходит поверх карты — потока там нет.
  const searchOverlay = full.isFull ? (
    <div className="card" style={{ padding: 'var(--space-2)', width: 'min(360px, 100%)' }}>
      {search}
    </div>
  ) : null;

  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <CustomerMapToolbar
        lang={lang}
        m={m}
        isOwner={isOwner}
        open={filtersOpen}
        onToggleOpen={() => setFiltersOpen(!filtersOpen)}
      />

      {/* В обычном режиме поиск стоит в потоке, как и стоял: оверлеем он
          закрывал бы треть карты на телефоне. */}
      {!full.isFull && search}

      <MapBanners lang={lang} m={m} />

      <div
        className="admin-map-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 340px)',
          gap: 'var(--space-3)',
          alignItems: 'start',
        }}
      >
        <MapStage
          isFull={full.isFull}
          overlayTop={searchOverlay}
          overlayBottom={
            <div style={{ display: 'grid', gap: 'var(--space-2)', justifyItems: 'start' }}>
              <MapPointsHere
                lang={lang}
                points={m.stack}
                onPick={m.pickFromStack}
                onClose={() => m.setStackIds([])}
              />
              {/* Завести заведение — там же, где палец, и в обоих
                  режимах. В поле это делают, стоя у дверей, а не
                  вечером по памяти, поэтому кнопка живёт на карте, а
                  не в списке клиентов. */}
              <AddCustomerHere lang={lang} />
            </div>
          }
        >
          {/* Скелет — не только при отказе тайлов.
              Пока точки не приехали, холст рисовал ПУСТУЮ карту: ни легенды,
              ни покрытия, а лоток рядом уверял «все клиенты на карте». После
              повторного входа это выглядит ровно как «точки исчезли» — и
              длится столько, сколько идёт запрос со всеми его повторами.
              Показываем скелет, только когда рисовать НЕЧЕГО: обычное
              обновление раз в минуту холст не гасит. */}
          {m.tilesFailed || (m.isLoading && m.collection.features.length === 0) ? (
            <MapSkeleton />
          ) : (
            <CustomerMapCanvas
              data={m.visible}
              delivery={m.delivery}
              mode={m.mode}
              selectedId={m.selectedId}
              placingId={m.placingId}
              onPickPoint={m.setSelectedId}
              onPickStack={m.setStackIds}
              isFull={full.isFull}
              onToggleFull={full.toggle}
              lang={lang}
              heat={m.showHeat}
              routeStops={route.stops}
              detailedBase={m.detailedBase}
              onPlace={m.savePin}
              onViewportChange={() => undefined}
              onTilesError={() => m.setTilesFailed(true)}
              focus={m.focus}
              // Вид подгоняется при смене фильтров и при появлении первых
              // точек — но не на каждом фоновом обновлении.
              fitToken={[
                m.typeFilter,
                m.cityFilter,
                m.district ?? '',
                m.showProspects ? 'p' : '',
                m.visible.features.length > 0 ? 'has' : 'none',
              ].join('|')}
            />
          )}
        </MapStage>

        <div className="admin-map-aside">
          <MapSidebar
            lang={lang}
            m={m}
            route={route}
            onOpenCard={onOpenCard}
            isOwner={isOwner}
            sellerName={sellerName}
          />
        </div>
      </div>

      {/* Док — только в полноэкранном режиме: в обычном те же панели стоят
          в боковой колонке, и вторая их копия внизу спорила бы с первой. */}
      {full.isFull && (
        <MapDock
          lang={lang}
          m={m}
          route={route}
          isOwner={isOwner}
          onOpenCard={onOpenCard}
          sellerName={sellerName}
          tab={dockTab}
          onTab={setDockTab}
          onExit={full.exit}
        />
      )}
    </div>
  );
}
