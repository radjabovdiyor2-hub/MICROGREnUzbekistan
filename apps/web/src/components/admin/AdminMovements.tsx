'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, ClipboardList} from 'lucide-react';

import { type Movement, type Product, type Sale, TYPE_CONFIG } from './movementTypes';
export type { Movement, Product, Sale };
export { TYPE_CONFIG };

import { AdminSalesTab } from './AdminSalesTab';
import { useFeedback } from './AdminFeedback';
import { AdminMovementsTab } from './AdminMovementsTab';

export function AdminMovements({ lang = 'ru' }: { lang?: 'ru' | 'uz' }) {
  // Экран был одноязычным. Здесь это особенно дорого: сторно — операция,
  // которая меняет остаток и деньги, и подтверждение к ней должно читаться
  // на языке того, кто нажимает.
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);
  const notify = useFeedback();
  const [typeFilter, setTypeFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [prodSearch, setProdSearch] = useState('');
  const [form, setForm] = useState({ productId: '', type: 'IN', quantity: '', reason: '', costPrice: '', performedBy: '', supplierId: '' });
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
  // Возвраты приходили вместе с продажами и не показывались нигде: выручка
  // дня уже была уменьшена на них, а увидеть, за что именно, было негде.
  const returns: Sale[] = salesData?.returns || [];
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
          supplierId: form.supplierId || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowAdd(false);
        setForm({ productId: '', type: 'IN', quantity: '', reason: '', costPrice: '', performedBy: '', supplierId: '' });
        setProdSearch('');
        fetchMovements();
        notify.success(t('Движение записано', 'Harakat yozildi'));
        // Предупреждение об остатке приходит вместе с ответом: показываем
        // его отдельным сообщением, чтобы «записано» и «мало осталось» не
        // слиплись в одну строку.
        if (data.alert) notify.toast(data.alert.message, 'warning');
      } else {
        notify.error(data.error || t('Движение не записано', 'Harakat yozilmadi'));
      }
    } catch (err) {
      console.error(err);
      notify.error(t('Нет связи — движение не записано', 'Aloqa yo‘q — harakat yozilmadi'));
    }
  };

  const handleDelete = async (id: string) => {
    // Текст говорит правду: с тех пор как удаление заменено обратной
    // проводкой, остаток КАК РАЗ меняется — движение сторнируется, а запись
    // остаётся в журнале. Прежняя формулировка обещала обратное.
    const agreed = await notify.confirm({
      title: t('Сделать сторно?', 'Storno qilinsinmi?'),
      detail: t('Движение останется в журнале, остаток вернётся.', 'Harakat jurnalda qoladi, ombor soni tiklanadi.'),
      confirmText: t('Сторно', 'Storno'),
      danger: true,
    });
    if (!agreed) return;

    setDeleting(id);
    try {
      const res = await fetch(`/api/inventory/movements?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchMovements();
        notify.success(t('Сторно проведено', 'Storno o‘tkazildi'));
      } else {
        notify.error(data.error || t('Сторно не прошло', 'Storno o‘tmadi'));
      }
    } catch (err) {
      console.error(err);
      notify.error(t('Нет связи — сторно не прошло', 'Aloqa yo‘q — storno o‘tmadi'));
    }
    finally { setDeleting(null); }
  };

  // Кнопки «Tozalash» (очистить всю историю) больше нет — и не будет.
  // Она слала DELETE ?clear=all, который стирал ВЕСЬ журнал движений, не
  // трогая остатки. Из этого журнала считается выручка кассы, поэтому один
  // клик обнулял её задним числом за всю историю. Ветку в API убрали, и
  // кнопка осталась висеть, шля запрос и получая отказ.
  // Ошибочное движение исправляется сторно — кнопкой в строке.

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
          { id: 'movements' as const, label: t('Движения', 'Harakatlar'), icon: <ClipboardList size={14} /> },
          { id: 'sales' as const, label: t('История продаж', 'Sotishlar tarixi'), icon: <BarChart size={14} /> },
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
          onExport={handleExport} />
      )}

      {/* ============ SALES HISTORY TAB ============ */}
      {tab === 'sales' && (
        <AdminSalesTab
          sales={sales} returns={returns} salesDate={salesDate} setSalesDate={setSalesDate}
          salesLoading={salesLoading} salesSummary={salesSummary}
          lang={lang} fmt={fmt} inputStyle={inputStyle} onExport={handleExport} />
      )}
    </div>
  );
}
