'use client';

import { useState, useEffect, useCallback } from 'react';
import { CROP_DB, fetchBatches, getBatchStatus, migrateLegacyBatches, type Batch, type ProductOption } from './growingData';

export function useAdminGrowing() {
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
    fetch('/api/products?limit=200')
      .then(r => r.json())
      .then(d => {
        const mapped = (d.items || []).map((p: Record<string, unknown>) => ({
          id: p.id as string,
          nameUz: p.nameUz as string,
          nameRu: p.nameRu as string,
          stock: p.stock as number,
          costPrice: (p.costPrice as number) || 0,
          price: (p.price as number) || 0,
        }));
        setProducts(mapped);
      })
      .catch(() => {});
  }, []);

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

  const fmt = (n: number) => n.toLocaleString('ru-RU');

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

  const enriched = batches.map(b => ({ ...b, info: getBatchStatus(b) }));
  const alerts = enriched.filter(b => b.info.status === 'ready' || b.info.status === 'expired');
  const filtered = enriched.filter(b => {
    if (filter === 'all') return true;
    if (filter === 'active') return b.info.status !== 'harvested';
    if (filter === 'ready') return b.info.status === 'ready';
    if (filter === 'alert') return b.info.status === 'expired' || (b.info.status === 'ready' && b.info.daysLeft <= 2);
    return true;
  });

  return {
    batches, showForm, setShowForm, cropType, setCropType, trays, setTrays, seedDate, setSeedDate,
    note, setNote, filter, setFilter, products, selectedProductId, setSelectedProductId, harvestQty,
    setHarvestQty, costPriceInput, setCostPriceInput, harvesting, editingId, setEditingId, customDark,
    setCustomDark, customLight, setCustomLight, customShelf, setCustomShelf, handleEdit, addBatch,
    harvestBatch, deleteBatch, writeOffBatch, fmt, enriched, alerts, filtered,
  };
}
