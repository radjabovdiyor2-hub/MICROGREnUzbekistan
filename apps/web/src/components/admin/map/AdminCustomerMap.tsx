'use client';

import dynamic from 'next/dynamic';
import { AlertCircle, CloudOff, MapPin, RefreshCw } from 'lucide-react';

import { CustomerMapToolbar } from './CustomerMapToolbar';
import { snapshotTime } from '@/lib/customers/mapSnapshot';

import { MapSearch } from './MapSearch';
import { MapSidebar } from './MapSidebar';
import { useCustomerMap } from './useCustomerMap';
import { useDayRoute } from './useDayRoute';

// maplibre-gl трогает window прямо на импорте: без ssr:false падает сборка,
// а не страница. Тот же приём, что у LottieAnimation и ArViewer.
const CustomerMapCanvas = dynamic(() => import('./CustomerMapCanvas'), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

// ══════════════════════════════════════════════════════════════════════
// Карта клиентов: разметка. Вся механика — в useCustomerMap.
// ══════════════════════════════════════════════════════════════════════

function MapSkeleton() {
  return (
    <div
      style={{
        height: '100%',
        minHeight: 320,
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-tertiary)',
        display: 'grid',
        placeItems: 'center',
        color: 'var(--text-muted)',
      }}
    >
      <RefreshCw size={20} className="animate-spin" />
    </div>
  );
}

interface Props {
  lang: 'ru' | 'uz';
  onOpenCard: (id: number) => void;
  /** Пакетный геокодер и правка карточки — только владельцу. */
  isOwner: boolean;
}

export function AdminCustomerMap({ lang, onOpenCard, isOwner }: Props) {
  const m = useCustomerMap();
  const route = useDayRoute();
  // `unplaced` уехал в MapSidebar вместе со строкой «на карте N из M».
  const { placed, total } = m.collection.summary;
  const nothingPlaced = !m.isLoading && placed === 0 && total > 0;

  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <CustomerMapToolbar
        lang={lang}
        mode={m.mode}
        onMode={m.setMode}
        typeFilter={m.typeFilter}
        onType={m.setTypeFilter}
        cityFilter={m.cityFilter}
        onCity={m.setCityFilter}
        loading={m.isLoading}
        onRefresh={() => m.refetch()}
        placed={placed}
        total={total}
        updatedAt={m.dataUpdatedAt}
        showProspects={m.showProspects}
        onProspects={m.setShowProspects}
        prospects={m.collection.summary.prospects}
        showDelivery={m.showDelivery}
        onDelivery={m.setShowDelivery}
        routes={m.routes.length}
        companyType={m.companyType}
        onCompanyType={m.setCompanyType}
        audience={m.audience}
        onAudience={m.setAudience}
      />

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

      {/* Связь пропала, но снимок есть: это не ошибка, а работа без сети.
          Красная плашка тут сказала бы «сломалось» про карту, по которой
          человек прямо сейчас едет. */}
      {m.snapshotAt !== null && (
        <div
          className="card"
          style={{
            padding: 'var(--space-3)',
            display: 'flex',
            gap: 'var(--space-2)',
            alignItems: 'center',
            color: 'var(--warning)',
          }}
        >
          <CloudOff size={16} />
          <span style={{ fontSize: 'var(--text-sm)' }}>
            {lang === 'ru'
              ? `Связи нет — карта снята ${snapshotTime(m.snapshotAt)}. Точки, адреса и телефоны на месте; отметить визит получится, когда связь вернётся.`
              : `Aloqa yoʻq — xarita ${snapshotTime(m.snapshotAt)} olingan. Nuqtalar va telefonlar joyida.`}
          </span>
        </div>
      )}

      {(m.snapshotAt === null &&
        (m.error || m.saveError || m.deliveryError || m.tilesFailed)) && (
        <div
          className="card"
          style={{
            padding: 'var(--space-3)',
            background: 'var(--error-bg)',
            color: 'var(--error)',
            display: 'flex',
            gap: 'var(--space-2)',
            alignItems: 'center',
          }}
        >
          <AlertCircle size={16} />
          <span style={{ fontSize: 'var(--text-sm)' }}>
            {m.saveError ||
              m.error?.message ||
              m.deliveryError?.message ||
              'Карта недоступна — тайлы не загрузились. Клиенты показаны списком ниже.'}
          </span>
        </div>
      )}

      {/* Не «пусто», а «координат нет ни у кого»: без этого экрана первый
          запуск неотличим от поломки. */}
      {nothingPlaced && (
        <div className="card" style={{ padding: 'var(--space-4)', textAlign: 'center' }}>
          <MapPin size={28} style={{ color: 'var(--text-muted)' }} />
          <h4 style={{ marginTop: 'var(--space-2)', fontWeight: 'var(--font-semibold)' }}>
            {lang === 'ru' ? 'Ни у одного клиента нет координат' : 'Hech kimda koordinata yoʻq'}
          </h4>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
            {lang === 'ru'
              ? 'Откройте список «Без координат» и поставьте пины вручную — начните с тех, кто платит больше.'
              : '«Koordinatasiz» roʻyxatini oching va pinlarni qoʻlda qoʻying.'}
          </p>
        </div>
      )}

      <div
        className="admin-map-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 340px)',
          gap: 'var(--space-3)',
          alignItems: 'start',
        }}
      >
        <div style={{ height: 'min(70vh, 640px)', minHeight: 320 }}>
          {m.tilesFailed ? (
            <MapSkeleton />
          ) : (
            <CustomerMapCanvas
              data={m.visible}
              delivery={m.delivery}
              mode={m.mode}
              selectedId={m.selectedId}
              placingId={m.placingId}
              onPickPoint={m.setSelectedId}
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
        </div>

        <MapSidebar lang={lang} m={m} route={route} onOpenCard={onOpenCard} isOwner={isOwner} />
      </div>
    </div>
  );
}
