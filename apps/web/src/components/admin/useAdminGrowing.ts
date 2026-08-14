'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  fetchBatches, fetchPlantingRequirements, getBatchStatus, migrateLegacyBatches,
  type Batch, type PlantingRequirement, type ProductOption,
} from './growingData';
import { harvestBatchApi, setDarkPhaseApi, writeOffBatchApi } from './growingActions';

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
  // «Нужно 30 г семян гороха, на складе 1 200 г» — показываем ДО посадки,
  // чтобы нехватка сырья не выяснялась в момент нажатия кнопки.
  const [requirements, setRequirements] = useState<PlantingRequirement[]>([]);
  const [estimatedCost, setEstimatedCost] = useState(0);
  const [plantError, setPlantError] = useState('');

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

  // Пересчитываем потребность при смене культуры или числа лотков.
  useEffect(() => {
    if (!showForm || editingId) return;
    let cancelled = false;
    (async () => {
      const result = await fetchPlantingRequirements(cropType, trays);
      if (cancelled) return;
      if (!result) {
        setRequirements([]); setEstimatedCost(0); setPlantError('');
      } else if ('error' in result) {
        setRequirements([]); setEstimatedCost(0); setPlantError(result.error);
      } else {
        setRequirements(result.needs); setEstimatedCost(result.estimatedCost); setPlantError('');
      }
    })();
    return () => { cancelled = true; };
  }, [showForm, editingId, cropType, trays]);

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

    if (editingId) {
      // Правка теперь сохраняет и даты, и длительности фаз. Раньше сюда
      // уходили только `trays` и `note`, и правка сроков молча пропадала.
      await patchBatch(editingId, {
        trays, note, seedDate,
        darkDays: customDark, lightDays: customLight, shelfDays: customShelf,
        productId: selectedProductId || null,
        productName: prod?.nameUz || null,
      });
      setEditingId(null);
    } else {
      // Длительности фаз и расход сырья сервер берёт из норм культуры
      // (crop_norms) — они общие для всех посадок и правятся в справочнике.
      const res = await fetch('/api/admin/grow-batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          cropType, trays, seedDate, note,
          productId: selectedProductId || undefined,
          productName: prod?.nameUz || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 409 — «не хватает данных»: нет нормы расхода или нет семян на
        // складе. Это вопрос владельцу, а не техническая ошибка.
        setPlantError(data.error || 'Не удалось создать посадку');
        return;
      }
      await reload();
    }
    setShowForm(false); setNote(''); setTrays(1); setHarvestQty(1); setCostPriceInput(0);
    setPlantError('');
  };

  const harvestBatch = async (id: string) => {
    const batch = batches.find(b => b.id === id);
    if (!batch) return;
    setHarvesting(id);
    try {
      await harvestBatchApi({ ...batch, harvestQty, productId: selectedProductId || batch.productId }, reload, fmt);
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
    setHarvesting(id);
    try {
      await writeOffBatchApi(batch, reload, fmt);
    } catch (err) {
      console.error(err);
      alert('Ошибка при списании');
    } finally {
      setHarvesting(null);
    }
  };

  // Досрочное открытие и продление темноты. Фаза считается из дат, поэтому
  // операция правит `darkDays` партии — статус вслед за ней пересчитается сам.
  const setDark = async (id: string, mode: 'open' | 'extend') => {
    const batch = batches.find(b => b.id === id);
    if (!batch) return;
    setHarvesting(id);
    try {
      await setDarkPhaseApi(batch, mode, reload);
    } catch (err) {
      console.error(err);
      alert('Ошибка при изменении тёмной фазы');
    } finally {
      setHarvesting(null);
    }
  };
  const openDark = (id: string) => setDark(id, 'open');
  const extendDark = (id: string) => setDark(id, 'extend');

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
    harvestBatch, deleteBatch, writeOffBatch, openDark, extendDark, fmt, enriched, alerts, filtered,
    requirements, estimatedCost, plantError,
  };
}
