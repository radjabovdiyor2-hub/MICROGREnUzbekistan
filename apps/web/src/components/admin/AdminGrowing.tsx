'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle, BarChart, CheckCircle, Edit, Leaf, Moon, Package, Plus, Sun, Trash,
} from 'lucide-react';

// Microgreen crop database with growing parameters
const CROP_DB: Record<string, { nameRu: string; darkDays: number; lightDays: number; shelfDays: number; color: string }> = {
  'radish': { nameRu: 'Редис', darkDays: 3, lightDays: 4, shelfDays: 7, color: 'var(--error)' },
  'broccoli': { nameRu: 'Брокколи', darkDays: 3, lightDays: 6, shelfDays: 7, color: 'var(--success)' },
  'sunflower': { nameRu: 'Подсолнух', darkDays: 4, lightDays: 6, shelfDays: 7, color: 'var(--warning)' },
  'pea': { nameRu: 'Горошек', darkDays: 4, lightDays: 8, shelfDays: 7, color: 'var(--cat-7)' },
  'arugula': { nameRu: 'Руккола', darkDays: 3, lightDays: 5, shelfDays: 7, color: 'var(--cat-1)' },
  'mustard': { nameRu: 'Горчица', darkDays: 3, lightDays: 4, shelfDays: 7, color: 'var(--cat-6)' },
  'amaranth': { nameRu: 'Амарант', darkDays: 4, lightDays: 8, shelfDays: 5, color: 'var(--cat-3)' },
  'basil': { nameRu: 'Базилик', darkDays: 4, lightDays: 10, shelfDays: 5, color: 'var(--cat-2)' },
  'cilantro': { nameRu: 'Кинза', darkDays: 5, lightDays: 10, shelfDays: 7, color: 'var(--cat-4)' },
  'kohlrabi': { nameRu: 'Кольраби', darkDays: 3, lightDays: 5, shelfDays: 7, color: 'var(--cat-9)' },
  'mizuna': { nameRu: 'Мизуна', darkDays: 3, lightDays: 5, shelfDays: 7, color: 'var(--brand-primary-hover)' },
  'wheatgrass': { nameRu: 'Витграсс', darkDays: 3, lightDays: 6, shelfDays: 5, color: 'var(--cat-10)' },
  'spinach': { nameRu: 'Шпинат', darkDays: 3, lightDays: 8, shelfDays: 5, color: 'var(--cat-11)' },
  'beet': { nameRu: 'Свёкла', darkDays: 4, lightDays: 8, shelfDays: 5, color: 'var(--cat-8)' },
  'cabbage': { nameRu: 'Капуста', darkDays: 3, lightDays: 5, shelfDays: 7, color: 'var(--cat-12)' },
  'other': { nameRu: 'Другое', darkDays: 3, lightDays: 6, shelfDays: 5, color: 'var(--text-secondary)' },
};

interface Batch {
  id: string;
  cropType: string;
  trays: number;
  seedDate: string; // ISO date
  darkDays: number;
  lightDays: number;
  shelfDays: number;
  note: string;
  status: 'dark' | 'light' | 'ready' | 'harvested' | 'expired';
  harvestDate?: string;
  productId?: string;
  productName?: string;
  harvestQty?: number;
  costPrice?: number; // себестоимость за единицу
}

interface ProductOption {
  id: string;
  nameUz: string;
  nameRu: string;
  stock: number;
  costPrice?: number;
  price: number;
}

// ══════════════════════════════════════════════════════════════════════
// Партии хранятся в базе (таблица grow_batches), а не в localStorage.
//
// Раньше весь производственный план жил в браузере: с телефона посадок
// не было видно, очистка кэша стирала их целиком, а бот и отчёты о них
// вообще не знали. Ключ ниже нужен только для разового переноса того,
// что уже накопилось у владельца в браузере.
// ══════════════════════════════════════════════════════════════════════

const LEGACY_KEY = 'mg_grow_batches';
const MIGRATED_KEY = 'mg_grow_batches_migrated';

async function fetchBatches(): Promise<Batch[]> {
  const res = await fetch('/api/admin/grow-batches?all=1', { credentials: 'same-origin' });
  const data = await res.json();
  return data.status === 'ok' ? (data.batches as Batch[]) : [];
}

/**
 * Разовый перенос партий из localStorage в базу.
 *
 * Флаг ставим ДО отправки: повторный запуск при частичной ошибке создал бы
 * дубли, а потерянную партию владелец увидит и заведёт заново — это
 * дешевле, чем разбирать удвоенный список.
 */
async function migrateLegacyBatches(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (localStorage.getItem(MIGRATED_KEY)) return false;

  let legacy: Batch[] = [];
  try {
    legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
  } catch {
    legacy = [];
  }

  localStorage.setItem(MIGRATED_KEY, '1');
  if (!Array.isArray(legacy) || !legacy.length) return false;

  for (const b of legacy) {
    try {
      await fetch('/api/admin/grow-batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          cropType: b.cropType, trays: b.trays, seedDate: b.seedDate,
          darkDays: b.darkDays, lightDays: b.lightDays, shelfDays: b.shelfDays,
          note: b.note,
        }),
      });
    } catch {
      // Продолжаем: одна неудача не должна оборвать перенос остальных.
    }
  }
  return true;
}

function daysBetween(a: string, b: string) {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

function getBatchStatus(batch: Batch): { status: Batch['status']; phase: string; daysInPhase: number; daysLeft: number; progress: number; alert?: string } {
  if (batch.status === 'harvested') return { status: 'harvested', phase: 'Собрано', daysInPhase: 0, daysLeft: 0, progress: 100 };

  const now = new Date().toISOString().slice(0, 10);
  const elapsed = daysBetween(batch.seedDate, now);
  const darkEnd = batch.darkDays;
  const lightEnd = darkEnd + batch.lightDays;
  const shelfEnd = lightEnd + batch.shelfDays;

  if (elapsed < darkEnd) {
    return { status: 'dark', phase: 'Тёмная фаза', daysInPhase: elapsed, daysLeft: darkEnd - elapsed, progress: (elapsed / shelfEnd) * 100 };
  }
  if (elapsed < lightEnd) {
    const d = elapsed - darkEnd;
    return { status: 'light', phase: 'На свету', daysInPhase: d, daysLeft: lightEnd - elapsed, progress: (elapsed / shelfEnd) * 100 };
  }
  if (elapsed < shelfEnd) {
    const d = elapsed - lightEnd;
    const left = shelfEnd - elapsed;
    return {
      status: 'ready', phase: 'Готов к продаже!', daysInPhase: d, daysLeft: left,
      progress: (elapsed / shelfEnd) * 100,
      alert: left <= 2 ? `Срочно продайте! Осталось ${left} дн.` : `Продавайте! Хранение ещё ${left} дн.`,
    };
  }
  return { status: 'expired', phase: 'Просрочен!', daysInPhase: elapsed - shelfEnd, daysLeft: 0, progress: 100, alert: 'СПИСАНИЕ — товар просрочен!' };
}

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

      {/* Add batch form */}
      {showForm && (
        <div className="card" style={{ padding: 'var(--space-4)', animation: 'reveal-up 0.3s ease both' }}>
          <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Leaf size={16} color="var(--brand-primary)" /> {editingId ? 'Изменить посадку' : 'Новая посадка'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Культура</label>
              <select value={cropType} onChange={e => {
                const c = e.target.value;
                setCropType(c);
                if (!editingId && CROP_DB[c]) {
                  setCustomDark(CROP_DB[c].darkDays);
                  setCustomLight(CROP_DB[c].lightDays);
                  setCustomShelf(CROP_DB[c].shelfDays);
                }
              }}
                style={{ ...inputStyle, cursor: 'pointer' }}>
                {Object.entries(CROP_DB).map(([key, val]) => (
                  <option key={key} value={key}>{val.nameRu} ({val.darkDays}д + {val.lightDays}с)</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Лотков</label>
              <input type="number" min={1} value={trays} onChange={e => setTrays(Number(e.target.value))} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Дата посева</label>
              <input type="date" value={seedDate} onChange={e => setSeedDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Заметка</label>
              <input type="text" placeholder="Поставщик, сорт..." value={note} onChange={e => setNote(e.target.value)} style={inputStyle} />
            </div>
          </div>
          {/* Product link + harvest qty + cost */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Товар на складе (сбор → +склад)</label>
              <select value={selectedProductId} onChange={e => {
                setSelectedProductId(e.target.value);
                const p = products.find(pr => pr.id === e.target.value);
                if (p?.costPrice) setCostPriceInput(p.costPrice);
              }}
                style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">— не привязывать —</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.nameUz} (ост: {p.stock})</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Получим шт (упаковок)</label>
              <input type="number" min={1} value={harvestQty} onChange={e => setHarvestQty(Number(e.target.value))} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Себест. (сум)</label>
              <input type="number" min={0} value={costPriceInput} onChange={e => setCostPriceInput(Number(e.target.value))} style={inputStyle} placeholder="8000" />
            </div>
          </div>
          {/* Preview timeline */}
          {/* Preview timeline & Editable Cycle */}
          <div style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '10px', background: 'var(--bg-secondary)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
              <span>Цикл выращивания (Дни)</span>
              <span>Всего: {customDark + customLight + customShelf} дней</span>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
              <div>
                <label style={{ fontSize: '10px', color: 'var(--cat-1)', fontWeight: 600, marginBottom: 2, display: 'block' }}>🌑 Темнота (груз)</label>
                <input type="number" min={0} value={customDark} onChange={e => setCustomDark(Number(e.target.value))} style={{...inputStyle, padding: '6px 8px'}} />
              </div>
              <div>
                <label style={{ fontSize: '10px', color: 'var(--warning)', fontWeight: 600, marginBottom: 2, display: 'block' }}>☀️ На свету</label>
                <input type="number" min={0} value={customLight} onChange={e => setCustomLight(Number(e.target.value))} style={{...inputStyle, padding: '6px 8px'}} />
              </div>
              <div>
                <label style={{ fontSize: '10px', color: 'var(--success)', fontWeight: 600, marginBottom: 2, display: 'block' }}>📦 Хранение</label>
                <input type="number" min={0} value={customShelf} onChange={e => setCustomShelf(Number(e.target.value))} style={{...inputStyle, padding: '6px 8px'}} />
              </div>
            </div>

            <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
              <div style={{ flex: customDark, background: 'var(--cat-1)', borderRadius: '4px 0 0 4px' }} title={`Темно: ${customDark} дн`} />
              <div style={{ flex: customLight, background: 'var(--warning)' }} title={`Свет: ${customLight} дн`} />
              <div style={{ flex: customShelf, background: 'var(--success)', borderRadius: '0 4px 4px 0' }} title={`Хранение: ${customShelf} дн`} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {editingId && (
              <button onClick={() => { setEditingId(null); setShowForm(false); }} className="btn"
                style={{ flex: 1, borderRadius: '10px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
                Отмена
              </button>
            )}
            <button onClick={addBatch} className="btn btn-primary"
              style={{ flex: 2, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              {editingId ? <CheckCircle size={16} /> : <Plus size={16} />} {editingId ? 'Сохранить изменения' : 'Добавить посадку'}
            </button>
          </div>
        </div>
      )}

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

      {/* Batch cards */}
      {filtered.length === 0 ? (
        <div className="card" style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Leaf size={48} style={{ opacity: 0.2, marginBottom: 'var(--space-2)' }} />
          <p style={{ fontSize: 'var(--text-sm)' }}>Нет посадок</p>
          <p style={{ fontSize: 'var(--text-xs)', marginTop: 4 }}>Нажмите «Посадка» чтобы начать</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map(batch => {
            const crop = CROP_DB[batch.cropType] || CROP_DB['other'];
            const { info } = batch;
            const sc = statusColors[info.status] || 'var(--text-secondary)';
            const total = batch.darkDays + batch.lightDays + batch.shelfDays;
            const lightDate = new Date(new Date(batch.seedDate).getTime() + batch.darkDays * 86400000).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
            const readyDate = new Date(new Date(batch.seedDate).getTime() + (batch.darkDays + batch.lightDays) * 86400000).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
            const expDate = new Date(new Date(batch.seedDate).getTime() + total * 86400000).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });

            return (
              <div key={batch.id} className="card" style={{
                padding: '14px 16px', borderRadius: '14px',
                borderLeft: `4px solid ${sc}`,
                animation: info.alert ? 'pulse 2s infinite' : undefined,
              }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '10px', flexShrink: 0,
                    background: `${crop.color}15`, color: crop.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Leaf size={18} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {crop.nameRu}
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>×{batch.trays} лотк.</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Посев: {new Date(batch.seedDate).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                      {batch.note && ` · ${batch.note}`}
                    </div>
                    {batch.productName && (
                      <div style={{ fontSize: '10px', color: 'var(--brand-primary)', fontWeight: 600, marginTop: 1, display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Package size={10} /> → {batch.productName} (+{batch.harvestQty || batch.trays} шт)
                        {batch.costPrice ? <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>· с/с {fmt(batch.costPrice)} сум</span> : null}
                      </div>
                    )}
                  </div>
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
                    background: `${sc}15`, color: sc,
                  }}>
                    {statusIcons[info.status]} {info.phase}
                  </span>
                </div>

                {/* Progress bar */}
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: 'var(--bg-tertiary)', gap: 1 }}>
                    <div style={{ width: `${Math.min(info.progress, 100)}%`, background: sc, borderRadius: 3, transition: 'width 0.5s' }} />
                  </div>
                </div>

                {/* Timeline dots */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginBottom: info.alert ? '8px' : 0 }}>
                  <span>🌑 На свет: {lightDate}</span>
                  <span>✅ Готов: {readyDate}</span>
                  <span>⚠️ Срок: {expDate}</span>
                </div>

                {/* Alert */}
                {info.alert && (
                  <div style={{
                    padding: '8px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                    background: info.status === 'expired' ? 'var(--error-bg)' : 'var(--success-bg)',
                    color: info.status === 'expired' ? 'var(--error)' : 'var(--success)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <span>{info.alert}</span>
                    {info.status === 'ready' && (
                      <button onClick={() => harvestBatch(batch.id)} disabled={harvesting === batch.id}
                        style={{
                          padding: '4px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                          background: 'var(--brand-primary-hover)', color: 'white', fontSize: '11px', fontWeight: 700,
                          opacity: harvesting === batch.id ? 0.6 : 1,
                        }}>
                        {harvesting === batch.id ? 'Добавляем...' : batch.productId ? 'Собрать → Склад' : 'Собрано'}
                      </button>
                    )}
                  </div>
                )}

                {/* Actions for expired → write off */}
                {info.status === 'expired' && (
                  <div style={{ marginTop: '6px', padding: '8px 12px', borderRadius: '8px', background: 'var(--error-bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--error)' }}>Просрочено! Списать?</div>
                      <div style={{ fontSize: '10px', color: 'var(--error)' }}>
                        Убыток: {fmt((batch.costPrice || 0) * (batch.harvestQty || batch.trays))} сум
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => writeOffBatch(batch.id)} disabled={harvesting === batch.id}
                        style={{ padding: '5px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: 'var(--error)', color: 'var(--text-inverse)', fontSize: '11px', fontWeight: 700, opacity: harvesting === batch.id ? 0.6 : 1 }}>
                        {harvesting === batch.id ? 'Списываем...' : 'Списать'}
                      </button>
                    </div>
                  </div>
                )}

                {/* General Actions (Edit/Delete) */}
                <div style={{ marginTop: info.status === 'expired' ? '6px' : '10px', display: 'flex', gap: '6px', justifyContent: 'flex-end', borderTop: info.status === 'expired' || info.status === 'harvested' ? 'none' : '1px solid var(--border)', paddingTop: info.status === 'expired' || info.status === 'harvested' ? '0' : '10px' }}>
                  {info.status !== 'harvested' && info.status !== 'expired' && (
                    <button onClick={() => handleEdit(batch)} style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Edit size={12} /> Изменить
                    </button>
                  )}
                  <button onClick={() => deleteBatch(batch.id)} style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: 'var(--bg-tertiary)', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Trash size={12} /> Удалить
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary stats */}
      {enriched.length > 0 && (
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <h4 style={{ fontWeight: 700, fontSize: '13px', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <BarChart size={14} /> Статистика посадок
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            {[
              { label: 'В темноте', count: enriched.filter(b => b.info.status === 'dark').length, color: 'var(--cat-1)', icon: <Moon size={14} /> },
              { label: 'На свету', count: enriched.filter(b => b.info.status === 'light').length, color: 'var(--warning)', icon: <Sun size={14} /> },
              { label: 'Готовы', count: enriched.filter(b => b.info.status === 'ready').length, color: 'var(--success)', icon: <CheckCircle size={14} /> },
              { label: 'Лотков', count: enriched.filter(b => b.info.status !== 'harvested').reduce((s, b) => s + b.trays, 0), color: 'var(--brand-primary)', icon: <Package size={14} /> },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: 'center', padding: '8px', borderRadius: '10px', background: `${s.color}08` }}>
                <div style={{ color: s.color, marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontWeight: 800, fontSize: '16px', fontFamily: 'var(--font-display)' }}>{fmt(s.count)}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
