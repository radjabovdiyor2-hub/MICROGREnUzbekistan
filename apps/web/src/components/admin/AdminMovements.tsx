'use client';

import { useState, useEffect } from 'react';
import {
  ArrowLeft, ArrowRight, BarChart, ClipboardList, Clock, Download, Folder, Package, Plus, Settings, ShoppingCart, Trash,
} from 'lucide-react';

interface Movement {
  id: string;
  type: string;
  quantity: number;
  reason: string | null;
  note: string | null;
  costPrice: number | null;
  performedBy: string | null;
  createdAt: string;
  product: { nameUz: string; nameRu: string; price: number; stock: number };
  supplier?: { name: string } | null;
}

interface Product { id: string; nameUz: string; stock: number; price: number; }

interface Sale {
  number: string;
  items: { quantity: number; product: { nameUz: string; price: number } }[];
  total: number;
  time: string;
  itemCount: number;
}

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  IN: { label: 'Kirim', color: '#10B981', icon: <ArrowRight size={14} /> },
  OUT: { label: 'Chiqim', color: '#EF4444', icon: <ArrowLeft size={14} /> },
  ADJUSTMENT: { label: 'Tuzatish', color: '#3B82F6', icon: <Settings size={14} /> },
  RETURN: { label: 'Qaytarish', color: '#8B5CF6', icon: <Package size={14} /> },
  WRITE_OFF: { label: 'Hisobdan chiqarish', color: '#F59E0B', icon: <Trash size={14} /> },
};

export function AdminMovements() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [prodSearch, setProdSearch] = useState('');
  const [form, setForm] = useState({ productId: '', type: 'IN', quantity: '', reason: '', costPrice: '', performedBy: '' });
  const [tab, setTab] = useState<'movements' | 'sales'>('movements');
  const [sales, setSales] = useState<Sale[]>([]);
  const [salesDate, setSalesDate] = useState(new Date().toISOString().slice(0, 10));
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesSummary, setSalesSummary] = useState({ totalSales: 0, totalItems: 0, totalRevenue: 0 });
  const [total, setTotal] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchMovements = async () => {
    setLoading(true);
    try {
      let url = '/api/inventory/movements?limit=100';
      if (typeFilter) url += `&type=${typeFilter}`;
      const res = await fetch(url);
      const data = await res.json();
      setMovements(data.movements || []);
      setTotal(data.total || 0);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const fetchSales = async () => {
    setSalesLoading(true);
    try {
      const res = await fetch(`/api/inventory/pos?date=${salesDate}`);
      const data = await res.json();
      setSales(data.sales || []);
      setSalesSummary(data.summary || { totalSales: 0, totalItems: 0, totalRevenue: 0 });
    } catch (err) { console.error(err); }
    finally { setSalesLoading(false); }
  };

  useEffect(() => { if (tab === 'movements') fetchMovements(); }, [typeFilter, tab]);
  useEffect(() => { if (tab === 'sales') fetchSales(); }, [salesDate, tab]);

  const searchProducts = async (q: string) => {
    if (q.length < 2) { setProducts([]); return; }
    const res = await fetch(`/api/products?search=${encodeURIComponent(q)}&limit=10`);
    const data = await res.json();
    setProducts(data.items || []);
  };

  useEffect(() => {
    const t = setTimeout(() => searchProducts(prodSearch), 300);
    return () => clearTimeout(t);
  }, [prodSearch]);

  const handleSubmit = async () => {
    if (!form.productId || !form.quantity) return;
    try {
      const res = await fetch('/api/inventory/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          quantity: parseInt(form.quantity),
          costPrice: form.costPrice ? parseInt(form.costPrice) : null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowAdd(false);
        setForm({ productId: '', type: 'IN', quantity: '', reason: '', costPrice: '', performedBy: '' });
        setProdSearch('');
        fetchMovements();
        if (data.alert) alert(`⚠️ ${data.alert.message}`);
      } else {
        alert(data.error || 'Xatolik');
      }
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bu harakatni o'chirmoqchimisiz? Ombor soni o'zgarmaydi.")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/inventory/movements?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchMovements();
      } else {
        alert(data.error || 'Xatolik');
      }
    } catch (err) { console.error(err); }
    finally { setDeleting(null); }
  };

  const handleClearAll = async () => {
    const msg = "BARCHA harakatlar tarixini o'chirmoqchimisiz?\n\nBu amalni ortga qaytarib bo'lmaydi!\nOmbordagi tovar soni o'zgarmaydi.";
    if (!confirm(msg)) return;
    if (!confirm("TASDIQLANG: Rostdan ham BARCHA tarix o'chirilsinmi?")) return;
    try {
      const res = await fetch('/api/inventory/movements?clear=all', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        alert(`${data.deleted} ta harakat o'chirildi`);
        fetchMovements();
      }
    } catch (err) { console.error(err); }
  };

  const handleExport = (type: string) => {
    window.open(`/api/inventory/export?type=${type}`, '_blank');
  };

  const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');
  const fmtTime = (d: string) => new Date(d).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const fmtDate = (d: string) => new Date(d).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const inputStyle = {
    width: '100%', padding: 'var(--space-2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)',
  };

  // Summary stats
  const todayMovements = movements.filter(m => new Date(m.createdAt).toDateString() === new Date().toDateString());
  const todayIn = todayMovements.filter(m => m.type === 'IN' || m.type === 'RETURN').reduce((s, m) => s + Math.abs(m.quantity), 0);
  const todayOut = todayMovements.filter(m => m.type === 'OUT' || m.type === 'WRITE_OFF').reduce((s, m) => s + Math.abs(m.quantity), 0);
  const todayCost = todayMovements.filter(m => m.type === 'IN' && m.costPrice).reduce((s, m) => s + (m.costPrice || 0) * Math.abs(m.quantity), 0);

  return (
    <div>
      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 'var(--space-1)', marginBottom: 'var(--space-3)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 2 }}>
        {[
          { id: 'movements' as const, label: 'Harakatlar', icon: <ClipboardList size={14} /> },
          { id: 'sales' as const, label: 'Sotishlar tarixi', icon: <BarChart size={14} /> },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)',
              border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              fontSize: 'var(--text-sm)', fontWeight: tab === t.id ? 700 : 500,
              background: tab === t.id ? 'var(--brand-primary)' : 'transparent',
              color: tab === t.id ? 'white' : 'var(--text-secondary)',
              transition: 'all 0.2s',
            }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ============ MOVEMENTS TAB ============ */}
      {tab === 'movements' && (
        <>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            <div className="card" style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Jami</div>
              <div style={{ fontWeight: 700, color: 'var(--brand-primary)' }}>{total}</div>
            </div>
            <div className="card" style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Bugun kirim</div>
              <div style={{ fontWeight: 700, color: 'var(--success)' }}>+{todayIn}</div>
            </div>
            <div className="card" style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Bugun chiqim</div>
              <div style={{ fontWeight: 700, color: 'var(--error)' }}>-{todayOut}</div>
            </div>
            <div className="card" style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Kirim qiymati</div>
              <div style={{ fontWeight: 700, fontSize: 'var(--text-xs)' }}>{todayCost > 0 ? fmt(todayCost) : '-'}</div>
            </div>
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              style={{ padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>
              <option value="">Barchasi</option>
              {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.label}</option>
              ))}
            </select>
            <div style={{ flex: 1 }} />
            <button onClick={() => handleExport('movements')} className="btn btn-outline btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--text-xs)' }}>
              <Download size={12} /> CSV
            </button>
            <button onClick={handleClearAll} className="btn btn-ghost btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--error)', fontSize: 'var(--text-xs)' }}>
              <Trash size={12} /> Tozalash
            </button>
            <button onClick={() => setShowAdd(!showAdd)} className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Plus size={14} /> Qo&apos;shish
            </button>
          </div>

          {/* Add Form */}
          {showAdd && (
            <div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-3)', borderLeft: '3px solid var(--brand-primary)' }}>
              <h4 style={{ fontWeight: 700, marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-sm)' }}>
                <Plus size={16} /> Yangi harakat
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                {/* Product search */}
                <div style={{ position: 'relative', gridColumn: '1/-1' }}>
                  <input placeholder="Tovar qidirish..." value={prodSearch} onChange={e => { setProdSearch(e.target.value); setForm(f => ({ ...f, productId: '' })); }}
                    style={inputStyle} />
                  {products.length > 0 && !form.productId && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', zIndex: 10, maxHeight: 200, overflowY: 'auto' }}>
                      {products.map(p => (
                        <div key={p.id} onClick={() => { setForm(f => ({ ...f, productId: p.id })); setProdSearch(p.nameUz); setProducts([]); }}
                          style={{ padding: 'var(--space-2) var(--space-3)', cursor: 'pointer', fontSize: 'var(--text-sm)', borderBottom: '1px solid var(--border)' }}>
                          {p.nameUz} <span style={{ color: 'var(--text-muted)' }}>({p.stock} dona)</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={inputStyle}>
                  {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                    <option key={key} value={key}>{cfg.label}</option>
                  ))}
                </select>
                <input type="number" placeholder="Miqdor *" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} style={inputStyle} />
                <input placeholder="Sabab" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} style={inputStyle} />
                <input placeholder="Kim tomonidan" value={form.performedBy} onChange={e => setForm(f => ({ ...f, performedBy: e.target.value }))} style={inputStyle} />
                {form.type === 'IN' && (
                  <input type="number" placeholder="Tan narxi (so'm)" value={form.costPrice} onChange={e => setForm(f => ({ ...f, costPrice: e.target.value }))} style={inputStyle} />
                )}
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
                <button onClick={handleSubmit} className="btn btn-primary btn-sm" disabled={!form.productId || !form.quantity}>Saqlash</button>
                <button onClick={() => setShowAdd(false)} className="btn btn-ghost btn-sm">Bekor</button>
              </div>
            </div>
          )}

          {/* Movements List */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
              <Clock size={32} style={{ animation: 'pulse 1.5s infinite' }} />
            </div>
          ) : movements.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
              <Folder size={48} style={{ opacity: 0.3, marginBottom: 'var(--space-2)' }} />
              <p>Harakatlar topilmadi</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {movements.map(m => {
                const cfg = TYPE_CONFIG[m.type] || TYPE_CONFIG.OUT;
                const totalValue = m.costPrice ? Math.abs(m.quantity) * m.costPrice : Math.abs(m.quantity) * m.product.price;
                return (
                  <div key={m.id} className="card" style={{ padding: 'var(--space-3)', display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: `${cfg.color}15`, color: cfg.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {cfg.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{m.product.nameUz}</span>
                        <span style={{ padding: '1px 6px', borderRadius: 'var(--radius-full)', background: `${cfg.color}15`, color: cfg.color, fontSize: '10px', fontWeight: 700 }}>{cfg.label}</span>
                      </div>
                      {/* Detail line 1: reason + who */}
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                        {m.reason && <span>{m.reason}</span>}
                        {m.performedBy && <span> · {m.performedBy}</span>}
                        {m.supplier && <span> · {m.supplier.name}</span>}
                      </div>
                      {/* Detail line 2: time + value + stock after */}
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 1, display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                        <span>{fmtDate(m.createdAt)}</span>
                        <span>· Qiymati: {fmt(totalValue)} so&apos;m</span>
                        <span>· Omborda: {m.product.stock} dona</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-base)', color: m.quantity > 0 ? 'var(--success)' : 'var(--error)' }}>
                        {m.quantity > 0 ? '+' : ''}{m.quantity}
                      </span>
                      {m.costPrice && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{fmt(m.costPrice)} so&apos;m/d</div>}
                      <button onClick={() => handleDelete(m.id)} disabled={deleting === m.id}
                        style={{
                          marginTop: 4, background: 'none', border: 'none', color: 'var(--text-muted)',
                          cursor: 'pointer', padding: 2, opacity: deleting === m.id ? 0.3 : 0.5,
                          transition: 'opacity 0.2s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                        onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
                        title="O'chirish">
                        <Trash size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ============ SALES HISTORY TAB ============ */}
      {tab === 'sales' && (
        <>
          {/* Date picker + summary */}
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', marginBottom: 'var(--space-3)', flexWrap: 'wrap' }}>
            <input type="date" value={salesDate} onChange={e => setSalesDate(e.target.value)}
              style={{ ...inputStyle, width: 'auto' }} />
            <button onClick={() => setSalesDate(new Date().toISOString().slice(0, 10))} className="btn btn-ghost btn-sm" style={{ fontSize: 'var(--text-xs)' }}>
              Bugun
            </button>
            <button onClick={() => {
              const d = new Date(salesDate);
              d.setDate(d.getDate() - 1);
              setSalesDate(d.toISOString().slice(0, 10));
            }} className="btn btn-ghost btn-sm" style={{ fontSize: 'var(--text-xs)' }}>
              ← Kecha
            </button>
            <div style={{ flex: 1 }} />
            <button onClick={() => handleExport('sales')} className="btn btn-outline btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--text-xs)' }}>
              <Download size={12} /> 30 kun CSV
            </button>
          </div>

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            <div className="card" style={{ padding: 'var(--space-3)', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Sotishlar</div>
              <div style={{ fontWeight: 800, fontSize: 'var(--text-lg)', color: 'var(--brand-primary)' }}>{salesSummary.totalSales}</div>
            </div>
            <div className="card" style={{ padding: 'var(--space-3)', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Tovarlar</div>
              <div style={{ fontWeight: 800, fontSize: 'var(--text-lg)' }}>{salesSummary.totalItems}</div>
            </div>
            <div className="card" style={{ padding: 'var(--space-3)', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Tushum</div>
              <div style={{ fontWeight: 800, fontSize: 'var(--text-sm)', color: 'var(--success)' }}>{fmt(salesSummary.totalRevenue)}</div>
            </div>
          </div>

          {/* Sales list */}
          {salesLoading ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
              <Clock size={32} style={{ animation: 'pulse 1.5s infinite' }} />
            </div>
          ) : sales.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
              <ShoppingCart size={48} style={{ opacity: 0.3, marginBottom: 'var(--space-2)' }} />
              <p>Bu kunda sotishlar yo&apos;q</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {sales.map((sale, idx) => (
                <div key={sale.number} className="card" style={{ padding: 'var(--space-3)' }}>
                  {/* Sale header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <span style={{ width: 28, height: 28, borderRadius: 'var(--radius-md)', background: 'var(--success-bg)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '11px' }}>
                        {idx + 1}
                      </span>
                      <div>
                        <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, fontFamily: 'monospace' }}>{sale.number}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          {new Date(sale.time).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })} · {sale.itemCount} ta tovar
                        </div>
                      </div>
                    </div>
                    <div style={{ fontWeight: 800, color: 'var(--success)', fontSize: 'var(--text-sm)' }}>
                      {fmt(sale.total)} so&apos;m
                    </div>
                  </div>
                  {/* Sale items */}
                  <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-2)' }}>
                    {sale.items.map((item, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', padding: '2px 0', color: 'var(--text-secondary)' }}>
                        <span>{Math.abs(item.quantity)}× {item.product.nameUz}</span>
                        <span style={{ fontWeight: 600 }}>{fmt(Math.abs(item.quantity) * item.product.price)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
