'use client';

import React, { useState, useEffect, useCallback } from 'react';
import * as Icons from '@/components/ui/Icons';

// Microgreen crop database with growing parameters
const CROP_DB: Record<string, { nameRu: string; darkDays: number; lightDays: number; shelfDays: number; color: string }> = {
  'radish': { nameRu: 'Редис', darkDays: 2, lightDays: 5, shelfDays: 7, color: '#EF4444' },
  'broccoli': { nameRu: 'Брокколи', darkDays: 3, lightDays: 5, shelfDays: 7, color: '#10B981' },
  'sunflower': { nameRu: 'Подсолнух', darkDays: 3, lightDays: 5, shelfDays: 5, color: '#F59E0B' },
  'pea': { nameRu: 'Горошек', darkDays: 3, lightDays: 5, shelfDays: 5, color: '#22C55E' },
  'arugula': { nameRu: 'Руккола', darkDays: 2, lightDays: 6, shelfDays: 7, color: '#6366F1' },
  'mustard': { nameRu: 'Горчица', darkDays: 2, lightDays: 4, shelfDays: 7, color: '#EAB308' },
  'amaranth': { nameRu: 'Амарант', darkDays: 3, lightDays: 6, shelfDays: 5, color: '#EC4899' },
  'basil': { nameRu: 'Базилик', darkDays: 3, lightDays: 8, shelfDays: 5, color: '#8B5CF6' },
  'cilantro': { nameRu: 'Кинза', darkDays: 3, lightDays: 8, shelfDays: 5, color: '#14B8A6' },
  'kohlrabi': { nameRu: 'Кольраби', darkDays: 2, lightDays: 5, shelfDays: 7, color: '#7C3AED' },
  'mizuna': { nameRu: 'Мизуна', darkDays: 2, lightDays: 5, shelfDays: 7, color: '#059669' },
  'wheatgrass': { nameRu: 'Витграсс', darkDays: 2, lightDays: 6, shelfDays: 3, color: '#16A34A' },
  'spinach': { nameRu: 'Шпинат', darkDays: 3, lightDays: 8, shelfDays: 5, color: '#047857' },
  'beet': { nameRu: 'Свёкла', darkDays: 3, lightDays: 7, shelfDays: 5, color: '#BE123C' },
  'cabbage': { nameRu: 'Капуста', darkDays: 2, lightDays: 5, shelfDays: 7, color: '#0D9488' },
  'other': { nameRu: 'Другое', darkDays: 3, lightDays: 6, shelfDays: 5, color: '#6B7280' },
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

const STORAGE_KEY = 'mg_grow_batches';

function loadBatches(): Batch[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}
function saveBatches(b: Batch[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(b)); }

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

  useEffect(() => { setBatches(loadBatches()); }, []);
  useEffect(() => {
    fetch('/api/products?limit=200').then(r => r.json()).then(d => {
      const mapped = (d.items || []).map((p: Record<string, unknown>) => ({ id: p.id as string, nameUz: p.nameUz as string, nameRu: p.nameRu as string, stock: p.stock as number, costPrice: (p.costPrice as number) || 0, price: (p.price as number) || 0 }));
      setProducts(mapped);
    }).catch(() => {});
  }, []);

  const save = useCallback((updated: Batch[]) => { setBatches(updated); saveBatches(updated); }, []);

  const addBatch = () => {
    const crop = CROP_DB[cropType] || CROP_DB['other'];
    const prod = products.find(p => p.id === selectedProductId);
    const batch: Batch = {
      id: Date.now().toString(36),
      cropType, trays, seedDate, note,
      darkDays: crop.darkDays, lightDays: crop.lightDays, shelfDays: crop.shelfDays,
      status: 'dark',
      productId: selectedProductId || undefined,
      productName: prod?.nameUz || undefined,
      harvestQty,
      costPrice: costPriceInput || prod?.costPrice || 0,
    };
    save([batch, ...batches]);
    setShowForm(false); setNote(''); setTrays(1); setHarvestQty(1); setCostPriceInput(0);
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
      save(batches.map(b => b.id === id ? { ...b, status: 'harvested' as const, harvestDate: new Date().toISOString().slice(0, 10) } : b));
    } catch (err) {
      console.error(err);
      alert('Ошибка при добавлении на склад');
    } finally {
      setHarvesting(null);
    }
  };

  const deleteBatch = (id: string) => {
    if (confirm('Удалить эту посадку?')) save(batches.filter(b => b.id !== id));
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
      save(batches.map(b => b.id === id ? { ...b, status: 'harvested' as const, harvestDate: new Date().toISOString().slice(0, 10), note: (b.note ? b.note + ' | ' : '') + `СПИСАНО, убыток ${fmt(loss)}` } : b));
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

  const statusColors: Record<string, string> = { dark: '#6366F1', light: '#F59E0B', ready: '#10B981', expired: '#EF4444', harvested: '#9CA3AF' };
  const statusIcons: Record<string, React.ReactNode> = {
    dark: <Icons.Moon size={14} />, light: <Icons.Sun size={14} />,
    ready: <Icons.CheckCircle size={14} />, expired: <Icons.AlertTriangle size={14} />,
    harvested: <Icons.Package size={14} />,
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
          background: 'linear-gradient(135deg, #FEF3C7, #FDE68A)', border: '1.5px solid #F59E0B40',
        }}>
          <Icons.AlertTriangle size={20} color="#D97706" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '13px', color: '#92400E' }}>
              {alerts.filter(a => a.info.status === 'ready').length} партий готовы к продаже
              {alerts.filter(a => a.info.status === 'expired').length > 0 && ` · ${alerts.filter(a => a.info.status === 'expired').length} просрочены!`}
            </div>
          </div>
          <button onClick={() => setFilter('ready')} style={{
            padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
            background: '#D97706', color: 'white', fontSize: '12px', fontWeight: 700,
          }}>Смотреть</button>
        </div>
      )}

      {/* Header + Add button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'var(--text-lg)', flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icons.Leaf size={20} color="var(--brand-primary)" /> Выращивание
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: '8px' }}>
            {enriched.filter(b => b.info.status !== 'harvested').length} активных
          </span>
        </h3>
        <button onClick={() => setShowForm(!showForm)} className="btn btn-primary btn-sm"
          style={{ display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '10px' }}>
          <Icons.Plus size={16} /> Посадка
        </button>
      </div>

      {/* Add batch form */}
      {showForm && (
        <div className="card" style={{ padding: 'var(--space-4)', animation: 'reveal-up 0.3s ease both' }}>
          <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icons.Leaf size={16} color="var(--brand-primary)" /> Новая посадка
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Культура</label>
              <select value={cropType} onChange={e => setCropType(e.target.value)}
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
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Кол-во сбора</label>
              <input type="number" min={1} value={harvestQty} onChange={e => setHarvestQty(Number(e.target.value))} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Себест. (сум)</label>
              <input type="number" min={0} value={costPriceInput} onChange={e => setCostPriceInput(Number(e.target.value))} style={inputStyle} placeholder="8000" />
            </div>
          </div>
          {/* Preview timeline */}
          {(() => {
            const crop = CROP_DB[cropType] || CROP_DB['other'];
            const total = crop.darkDays + crop.lightDays + crop.shelfDays;
            return (
              <div style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '10px', background: 'var(--bg-secondary)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6 }}>Цикл: {total} дней</div>
                <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
                  <div style={{ flex: crop.darkDays, background: '#6366F1', borderRadius: '4px 0 0 4px' }} title={`Темно: ${crop.darkDays} дн`} />
                  <div style={{ flex: crop.lightDays, background: '#F59E0B' }} title={`Свет: ${crop.lightDays} дн`} />
                  <div style={{ flex: crop.shelfDays, background: '#10B981', borderRadius: '0 4px 4px 0' }} title={`Хранение: ${crop.shelfDays} дн`} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: '10px', color: 'var(--text-muted)' }}>
                  <span>🌑 {crop.darkDays}д темно</span>
                  <span>☀️ {crop.lightDays}д свет</span>
                  <span>📦 {crop.shelfDays}д хранение</span>
                </div>
              </div>
            );
          })()}
          <button onClick={addBatch} className="btn btn-primary btn-block"
            style={{ borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <Icons.Plus size={16} /> Добавить посадку
          </button>
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
          <Icons.Leaf size={48} style={{ opacity: 0.2, marginBottom: 'var(--space-2)' }} />
          <p style={{ fontSize: 'var(--text-sm)' }}>Нет посадок</p>
          <p style={{ fontSize: 'var(--text-xs)', marginTop: 4 }}>Нажмите «Посадка» чтобы начать</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map(batch => {
            const crop = CROP_DB[batch.cropType] || CROP_DB['other'];
            const { info } = batch;
            const sc = statusColors[info.status] || '#6B7280';
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
                    <Icons.Leaf size={18} />
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
                        <Icons.Package size={10} /> → {batch.productName} (+{batch.harvestQty || batch.trays} шт)
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
                    background: info.status === 'expired' ? '#FEE2E2' : '#D1FAE5',
                    color: info.status === 'expired' ? '#991B1B' : '#065F46',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <span>{info.alert}</span>
                    {info.status === 'ready' && (
                      <button onClick={() => harvestBatch(batch.id)} disabled={harvesting === batch.id}
                        style={{
                          padding: '4px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                          background: '#059669', color: 'white', fontSize: '11px', fontWeight: 700,
                          opacity: harvesting === batch.id ? 0.6 : 1,
                        }}>
                        {harvesting === batch.id ? 'Добавляем...' : batch.productId ? 'Собрать → Склад' : 'Собрано'}
                      </button>
                    )}
                  </div>
                )}

                {/* Actions for expired → write off */}
                {info.status === 'expired' && (
                  <div style={{ marginTop: '6px', padding: '8px 12px', borderRadius: '8px', background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#991B1B' }}>Просрочено! Списать?</div>
                      <div style={{ fontSize: '10px', color: '#B91C1C' }}>
                        Убыток: {fmt((batch.costPrice || 0) * (batch.harvestQty || batch.trays))} сум
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => writeOffBatch(batch.id)} disabled={harvesting === batch.id}
                        style={{ padding: '5px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: '#DC2626', color: 'white', fontSize: '11px', fontWeight: 700, opacity: harvesting === batch.id ? 0.6 : 1 }}>
                        {harvesting === batch.id ? 'Списываем...' : 'Списать'}
                      </button>
                      <button onClick={() => deleteBatch(batch.id)} style={{ padding: '5px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: 'var(--bg-tertiary)', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>
                        <Icons.Trash size={12} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Actions for harvested */}
                {info.status === 'harvested' && (
                  <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={() => deleteBatch(batch.id)} style={{
                      padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                      background: 'var(--bg-tertiary)', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600,
                      display: 'flex', alignItems: 'center', gap: '4px',
                    }}>
                      <Icons.Trash size={12} /> Удалить
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Summary stats */}
      {enriched.length > 0 && (
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <h4 style={{ fontWeight: 700, fontSize: '13px', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Icons.BarChart size={14} /> Статистика посадок
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            {[
              { label: 'В темноте', count: enriched.filter(b => b.info.status === 'dark').length, color: '#6366F1', icon: <Icons.Moon size={14} /> },
              { label: 'На свету', count: enriched.filter(b => b.info.status === 'light').length, color: '#F59E0B', icon: <Icons.Sun size={14} /> },
              { label: 'Готовы', count: enriched.filter(b => b.info.status === 'ready').length, color: '#10B981', icon: <Icons.CheckCircle size={14} /> },
              { label: 'Лотков', count: enriched.filter(b => b.info.status !== 'harvested').reduce((s, b) => s + b.trays, 0), color: 'var(--brand-primary)', icon: <Icons.Package size={14} /> },
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
