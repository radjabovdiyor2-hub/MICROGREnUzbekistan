'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight, BarChart, ClipboardList, Package, Settings, Trash } from 'lucide-react';

export interface Movement {
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

export interface Product { id: string; nameUz: string; stock: number; price: number; }

export interface Sale {
  number: string;
  items: { quantity: number; product: { nameUz: string; price: number } }[];
  total: number;
  time: string;
  itemCount: number;
}

export const TYPE_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  IN: { label: 'Kirim', color: 'var(--success)', icon: <ArrowRight size={14} /> },
  OUT: { label: 'Chiqim', color: 'var(--error)', icon: <ArrowLeft size={14} /> },
  ADJUSTMENT: { label: 'Tuzatish', color: 'var(--info)', icon: <Settings size={14} /> },
  RETURN: { label: 'Qaytarish', color: 'var(--cat-2)', icon: <Package size={14} /> },
  WRITE_OFF: { label: 'Hisobdan chiqarish', color: 'var(--warning)', icon: <Trash size={14} /> },
};

import { AdminSalesTab } from './AdminSalesTab';
import { AdminMovementsTab } from './AdminMovementsTab';

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
        <AdminMovementsTab
          movements={movements} loading={loading} typeFilter={typeFilter} setTypeFilter={setTypeFilter}
          showAdd={showAdd} setShowAdd={setShowAdd} total={total} deleting={deleting}
          form={form} setForm={setForm} products={products} setProducts={setProducts}
          prodSearch={prodSearch} setProdSearch={setProdSearch}
          todayIn={todayIn} todayOut={todayOut} todayCost={todayCost}
          fmt={fmt} fmtDate={fmtDate} inputStyle={inputStyle}
          onSubmit={handleSubmit} onDelete={handleDelete}
          onClearAll={handleClearAll} onExport={handleExport} />
      )}

      {/* ============ SALES HISTORY TAB ============ */}
      {tab === 'sales' && (
        <AdminSalesTab
          sales={sales} salesDate={salesDate} setSalesDate={setSalesDate}
          salesLoading={salesLoading} salesSummary={salesSummary}
          fmt={fmt} inputStyle={inputStyle} onExport={handleExport} />
      )}
    </div>
  );
}
