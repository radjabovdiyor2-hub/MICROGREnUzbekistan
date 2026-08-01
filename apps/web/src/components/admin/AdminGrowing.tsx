'use client';

import { AdminGrowingForm } from './AdminGrowingForm';

import { AdminGrowingCards } from './AdminGrowingCards';

import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, CheckCircle, Leaf, Moon, Package, Plus, Sun } from 'lucide-react';

import {
  CROP_DB, fetchBatches, getBatchStatus, migrateLegacyBatches, type Batch, type ProductOption,
} from './growingData';

export function AdminGrowing() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [cropType, setCropType] = useState('radish');
  const [trays, setTrays] = useState(1);
  const [seedDate, setSeedDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'ready' | 'alert'>('active');
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [harvestQty, setHarvestQty] = useState(1);
  const [costPriceInput, setCostPriceInput] = useState(0);
  const [harvesting, setHarvesting] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [customDark, setCustomDark] = useState<number>(3);
  const [customLight, setCustomLight] = useState<number>(4);
  const [customShelf, setCustomShelf] = useState<number>(7);

  const reload = useCallback(async () => {
    try {
      setBatches(await fetchBatches());
    } catch (err) {
      console.error('[growing] не удалось загрузить партии:', err);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await migrateLegacyBatches();
      await reload();
    })();
  }, [reload]);

  useEffect(() => {
    fetch('/api/products?limit=200').then(r => r.json()).then(d => {
      const mapped = (d.items || []).map((p: Record<string, unknown>) => ({ id: p.id as string, nameUz: p.nameUz as string, nameRu: p.nameRu as string, stock: p.stock as number, costPrice: (p.costPrice as number) || 0, price: (p.price as number) || 0 }));
      setProducts(mapped);
    }).catch(() => {});
  }, []);

  /** Записать изменения партии в базу и перечитать список. */
  const patchBatch = useCallback(async (id: string, patch: Record<string, unknown>) => {
    await fetch('/api/admin/grow-batches', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ id, ...patch }),
    });
    await reload();
  }, [reload]);

  const handleEdit = (batch: Batch) => {
    setEditingId(batch.id);
    setCropType(batch.cropType);
    setTrays(batch.trays);
    setSeedDate(batch.seedDate);
    setNote(batch.note);
    setSelectedProductId(batch.productId || '');
    setHarvestQty(batch.harvestQty || batch.trays);
    setCostPriceInput(batch.costPrice || 0);
    setCustomDark(batch.darkDays);
    setCustomLight(batch.lightDays);
    setCustomShelf(batch.shelfDays);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const addBatch = async () => {
    const prod = products.find(p => p.id === selectedProductId);
    const newBatchData = {
      cropType, trays, seedDate, note,
      darkDays: customDark, lightDays: customLight, shelfDays: customShelf,
      productId: selectedProductId || undefined,
      productName: prod?.nameUz || undefined,
      harvestQty,
      costPrice: costPriceInput || prod?.costPrice || 0,
    };

    if (editingId) {
      await patchBatch(editingId, { trays, note });
      setEditingId(null);
    } else {
      await fetch('/api/admin/grow-batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(newBatchData),
      });
      await reload();
    }
    setShowForm(false); setNote(''); setTrays(1); setHarvestQty(1); setCostPriceInput(0);
    setCustomDark(CROP_DB['radish'].darkDays);
    setCustomLight(CROP_DB['radish'].lightDays);
    setCustomShelf(CROP_DB['radish'].shelfDays);
  };

  const harvestBatch = async (id: string) => {
    const batch = batches.find(b => b.id === id);
    if (!batch) return;
    setHarvesting(id);
    try {
      // If linked to a product, add stock
      if (batch.productId) {
        const qty = batch.harvestQty || batch.trays;
        const res = await fetch('/api/inventory/movements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: batch.productId,
            type: 'IN',
            quantity: qty,
            reason: 'Урожай с посадки',
            note: `${(CROP_DB[batch.cropType] || CROP_DB['other']).nameRu}, ${batch.trays} лотков, посев ${batch.seedDate}`,
            costPrice: batch.costPrice || 0,
            performedBy: 'Посадки',
          }),
        });
        const data = await res.json();
        if (data.success) {
          alert(`✅ +${qty} шт «${batch.productName}» добавлено на склад! Остаток: ${data.newStock}`);
        } else {
          alert(`Ошибка: ${data.error}`);
        }
      }
      await patchBatch(id, {
        harvestQty: batch.harvestQty || batch.trays,
        productId: batch.productId,
        productName: batch.productName,
        costPrice: batch.costPrice,
      });
    } catch (err) {
      console.error(err);
      alert('Ошибка при добавлении на склад');
    } finally {
      setHarvesting(null);
    }
  };

  const deleteBatch = async (id: string) => {
    if (!confirm('Удалить эту посадку?')) return;
    await fetch(`/api/admin/grow-batches?id=${id}`, { method: 'DELETE', credentials: 'same-origin' });
    await reload();
  };

  // Write off expired batch → WRITE_OFF movement (loss)
  const writeOffBatch = async (id: string) => {
    const batch = batches.find(b => b.id === id);
    if (!batch) return;
    const qty = batch.harvestQty || batch.trays;
    const loss = (batch.costPrice || 0) * qty;
    if (!confirm(`Списать партию? Убыток: ${fmt(loss)} сум`)) return;
    setHarvesting(id);
    try {
      if (batch.productId) {
        await fetch('/api/inventory/movements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: batch.productId,
            type: 'WRITE_OFF',
            quantity: qty,
            reason: 'Просрочка посадки',
            note: `${(CROP_DB[batch.cropType] || CROP_DB['other']).nameRu}, ${batch.trays} лотков, посев ${batch.seedDate}. Убыток: ${fmt(loss)} сум`,
            costPrice: batch.costPrice || 0,
            performedBy: 'Посадки (списание)',
          }),
        });
      }
      await patchBatch(id, {
        harvestQty: qty,
        productId: batch.productId,
        productName: batch.productName,
        costPrice: batch.costPrice,
        note: (batch.note ? batch.note + ' | ' : '') + `СПИСАНО, убыток ${fmt(loss)}`,
      });
      alert(`❌ Списано. Убыток: ${fmt(loss)} сум`);
    } catch (err) {
      console.error(err);
      alert('Ошибка при списании');
    } finally {
      setHarvesting(null);
    }
  };

  const fmt = (n: number) => n.toLocaleString('ru-RU');

  // Compute statuses
  const enriched = batches.map(b => ({ ...b, info: getBatchStatus(b) }));
  const alerts = enriched.filter(b => b.info.status === 'ready' || b.info.status === 'expired');
  const filtered = enriched.filter(b => {
    if (filter === 'all') return true;
    if (filter === 'active') return b.info.status !== 'harvested';
    if (filter === 'ready') return b.info.status === 'ready';
    if (filter === 'alert') return b.info.status === 'expired' || (b.info.status === 'ready' && b.info.daysLeft <= 2);
    return true;
  });

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
      />
    </div>
  );
}
