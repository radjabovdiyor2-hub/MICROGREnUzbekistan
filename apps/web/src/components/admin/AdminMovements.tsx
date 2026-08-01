'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, ClipboardList} from 'lucide-react';

import { type Movement, type Product, type Sale, TYPE_CONFIG } from './movementTypes';
export type { Movement, Product, Sale };
export { TYPE_CONFIG };

import { AdminSalesTab } from './AdminSalesTab';
import { AdminMovementsTab } from './AdminMovementsTab';

export function AdminMovements() {
  const [typeFilter, setTypeFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [prodSearch, setProdSearch] = useState('');
  const [form, setForm] = useState({ productId: '', type: 'IN', quantity: '', reason: '', costPrice: '', performedBy: '' });
  const [tab, setTab] = useState<'movements' | 'sales'>('movements');
  const [salesDate, setSalesDate] = useState(new Date().toISOString().slice(0, 10));
  const [deleting, setDeleting] = useState<string | null>(null);
  const { data: movementsData, isLoading: movementsLoading, refetch: fetchMovements } = useQuery({
    queryKey: ['admin-movements', typeFilter],
    queryFn: async () => {
      let url = '/api/inventory/movements?limit=100';
      if (typeFilter) url += `&type=${typeFilter}`;
      const res = await fetch(url);
      return await res.json();
    },
    enabled: tab === 'movements',
  });
  const movements: Movement[] = movementsData?.movements || [];
  const total: number = movementsData?.total || 0;
  const loading = movementsLoading && tab === 'movements';

  const { data: salesData, isLoading: salesLoadingLoading } = useQuery({
    queryKey: ['admin-sales', salesDate],
    queryFn: async () => {
      const res = await fetch(`/api/inventory/pos?date=${salesDate}`);
      return await res.json();
    },
    enabled: tab === 'sales',
  });
  const sales: Sale[] = salesData?.sales || [];
  const salesSummary = salesData?.summary || { totalSales: 0, totalItems: 0, totalRevenue: 0 };
  const salesLoading = salesLoadingLoading && tab === 'sales';

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
