'use client';

import React from 'react';
import { AlertTriangle, CheckCircle, Leaf, Moon, Package, Plus, Sun } from 'lucide-react';
import { AdminGrowingForm } from './AdminGrowingForm';
import { AdminGrowingCards } from './AdminGrowingCards';
import { useAdminGrowing } from './useAdminGrowing';

export function AdminGrowing({ focus = '' }: { focus?: string }) {
  const {
    showForm, setShowForm, cropType, setCropType, trays, setTrays, seedDate, setSeedDate,
    note, setNote, filter, setFilter, products, selectedProductId, setSelectedProductId, harvestQty,
    setHarvestQty, costPriceInput, setCostPriceInput, harvesting, editingId, setEditingId, customDark,
    setCustomDark, customLight, setCustomLight, customShelf, setCustomShelf, handleEdit, addBatch,
    harvestBatch, deleteBatch, writeOffBatch, openDark, extendDark, fmt, enriched, alerts, filtered,
    requirements, estimatedCost, plantError,
  } = useAdminGrowing();

  const statusColors: Record<string, string> = { dark: 'var(--cat-1)', light: 'var(--warning)', ready: 'var(--success)', expired: 'var(--error)', harvested: 'var(--text-muted)' };
  const statusIcons: Record<string, React.ReactNode> = {
    dark: <Moon size={14} />, light: <Sun size={14} />,
    ready: <CheckCircle size={14} />, expired: <AlertTriangle size={14} />,
    harvested: <Package size={14} />,
  };

  const inputStyle = {
    width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)',
    borderRadius: '10px', background: 'var(--bg-primary)', color: 'var(--text-primary)',
    fontSize: 'var(--text-sm)', outline: 'none',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {/* Alerts banner */}
      {alerts.length > 0 && (
        <div style={{
          padding: '12px 16px', borderRadius: '14px', display: 'flex', alignItems: 'center', gap: '10px',
          background: 'var(--warning-bg)', border: '1.5px solid var(--warning)',
        }}>
          <AlertTriangle size={20} color="var(--warning)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--warning)' }}>
              {alerts.filter(a => a.info.status === 'ready').length} партий готовы к продаже
              {alerts.filter(a => a.info.status === 'expired').length > 0 && ` · ${alerts.filter(a => a.info.status === 'expired').length} просрочены!`}
            </div>
          </div>
          <button onClick={() => setFilter('ready')} style={{
            padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
            background: 'var(--warning)', color: 'var(--text-inverse)', fontSize: '12px', fontWeight: 700,
          }}>Смотреть</button>
        </div>
      )}

      {/* Header + Add button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'var(--text-lg)', flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Leaf size={20} color="var(--brand-primary)" /> Выращивание
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: '8px' }}>
            {enriched.filter(b => b.info.status !== 'harvested').length} активных
          </span>
        </h3>
        <button onClick={() => { setEditingId(null); setShowForm(!showForm); }} className="btn btn-primary btn-sm"
          style={{ display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '10px' }}>
          <Plus size={16} /> Посадка
        </button>
      </div>

      <AdminGrowingForm
        showForm={showForm}
        setShowForm={setShowForm}
        editingId={editingId}
        setEditingId={setEditingId}
        products={products}
        selectedProductId={selectedProductId}
        setSelectedProductId={setSelectedProductId}
        cropType={cropType}
        setCropType={setCropType}
        trays={trays}
        setTrays={setTrays}
        seedDate={seedDate}
        setSeedDate={setSeedDate}
        harvestQty={harvestQty}
        setHarvestQty={setHarvestQty}
        costPriceInput={costPriceInput}
        setCostPriceInput={setCostPriceInput}
        note={note}
        setNote={setNote}
        customDark={customDark}
        setCustomDark={setCustomDark}
        customLight={customLight}
        setCustomLight={setCustomLight}
        customShelf={customShelf}
        setCustomShelf={setCustomShelf}
        addBatch={addBatch}
        requirements={requirements}
        estimatedCost={estimatedCost}
        plantError={plantError}
        inputStyle={inputStyle}
      />

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: 2 }}>
        {([
          { key: 'active', label: 'Активные', count: enriched.filter(b => b.info.status !== 'harvested').length },
          { key: 'ready', label: 'Готовы', count: enriched.filter(b => b.info.status === 'ready').length },
          { key: 'alert', label: 'Срочные', count: enriched.filter(b => b.info.status === 'expired' || (b.info.status === 'ready' && b.info.daysLeft <= 2)).length },
          { key: 'all', label: 'Все', count: enriched.length },
        ] as const).map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            style={{
              padding: '6px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer',
              fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap', transition: 'all 0.2s',
              background: filter === f.key ? 'var(--brand-primary)' : 'var(--bg-tertiary)',
              color: filter === f.key ? 'white' : 'var(--text-secondary)',
            }}>
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      <AdminGrowingCards
        focus={focus}
        filtered={filtered}
        enriched={enriched}
        statusColors={statusColors}
        statusIcons={statusIcons}
        harvesting={harvesting}
        fmt={fmt}
        handleEdit={handleEdit}
        harvestBatch={harvestBatch}
        writeOffBatch={writeOffBatch}
        deleteBatch={deleteBatch}
        openDark={openDark}
        extendDark={extendDark}
      />
    </div>
  );
}
