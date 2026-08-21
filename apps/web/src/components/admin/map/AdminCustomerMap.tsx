'use client';

import dynamic from 'next/dynamic';
import { AlertCircle, MapPin, RefreshCw } from 'lucide-react';

import { CategoryLegend } from './CategoryLegend';
import { CustomerMapLegend } from './CustomerMapLegend';
import { CustomerMapPanel } from './CustomerMapPanel';
import { CustomerMapToolbar } from './CustomerMapToolbar';
import { DistrictBreakdown } from './DistrictBreakdown';
import { UnplacedTray } from './UnplacedTray';
import { useCustomerMap } from './useCustomerMap';

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
}

export function AdminCustomerMap({ lang, onOpenCard }: Props) {
  const m = useCustomerMap();
  const { placed, total, unplaced } = m.collection.summary;
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

      {(m.error || m.saveError || m.deliveryError || m.tilesFailed) && (
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

        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          {m.selected && (
            <div className="admin-map-panel">
              <CustomerMapPanel
                point={m.selected}
                lang={lang}
                onClose={() => m.setSelectedId(null)}
                onOpenCard={onOpenCard}
                onReplacePin={(id) => {
                  m.setPlacingId(id);
                  m.setSelectedId(null);
                }}
              />
            </div>
          )}

          {/* Легенда объясняет ТЕКУЩУЮ раскраску. Показывать состояния
              отношений, когда точки покрашены по типу заведения, значит
              подписывать карту цветами, которых на ней нет. */}
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
      </div>
    </div>
  );
}
