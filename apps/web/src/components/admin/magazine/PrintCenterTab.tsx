'use client';

import { useState, useEffect } from 'react';
import * as Icons from '@/components/ui/Icons';
import { adminFetch } from '@/lib/adminClient';

export function PrintCenterTab() {
  const [activeSubTab, setActiveSubTab] = useState<'dashboard' | 'subscriptions' | 'orders'>('dashboard');

  return (
    <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <button onClick={() => setActiveSubTab('dashboard')} style={subTabStyle(activeSubTab === 'dashboard')}>Дашборд Маржи</button>
        <button onClick={() => setActiveSubTab('subscriptions')} style={subTabStyle(activeSubTab === 'subscriptions')}>Подписки B2B</button>
        <button onClick={() => setActiveSubTab('orders')} style={subTabStyle(activeSubTab === 'orders')}>Тиражи</button>
      </div>

      {activeSubTab === 'dashboard' && <DashboardTab />}
      {activeSubTab === 'subscriptions' && <SubscriptionsTab />}
      {activeSubTab === 'orders' && <OrdersTab />}
    </div>
  );
}

function subTabStyle(active: boolean) {
  return {
    padding: '6px 12px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    background: active ? 'var(--brand-primary)' : 'var(--bg-secondary)',
    color: active ? '#fff' : 'var(--text-primary)',
    fontWeight: 600
  };
}

// ==========================================
// Дашборд
// ==========================================
function DashboardTab() {
  const [summary, setSummary] = useState({ revenue: 0, cost: 0, margin: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminFetch('/api/admin/magazine/print-orders?report=1')
      .then(r => r.json())
      .then(data => setSummary(data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div>Загрузка...</div>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
      <div className="card" style={{ padding: 'var(--space-4)', textAlign: 'center' }}>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>Выручка (B2B)</div>
        <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 'bold' }}>{summary.revenue.toLocaleString()} UZS</div>
      </div>
      <div className="card" style={{ padding: 'var(--space-4)', textAlign: 'center' }}>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>Себестоимость печати</div>
        <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 'bold', color: 'var(--error)' }}>{summary.cost.toLocaleString()} UZS</div>
      </div>
      <div className="card" style={{ padding: 'var(--space-4)', textAlign: 'center' }}>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>Чистая маржа</div>
        <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 'bold', color: 'var(--success)' }}>{summary.margin.toLocaleString()} UZS</div>
      </div>
    </div>
  );
}

// ==========================================
// Подписки
// ==========================================
function SubscriptionsTab() {
  const [subs, setSubs] = useState<any[]>([]);
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [form, setForm] = useState({ restaurantId: '', plan: 'weekly', copiesPerIssue: 50, pricePerCopy: 10000, unitCost: 4000 });
  
  const load = async () => {
    const [s, r] = await Promise.all([
      adminFetch('/api/admin/magazine/subscriptions').then(x => x.json()),
      adminFetch('/api/admin/magazine/restaurants').then(x => x.json())
    ]);
    setSubs(s);
    setRestaurants(r);
  };
  useEffect(() => { load(); }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    await adminFetch('/api/admin/magazine/subscriptions', { method: 'POST', body: JSON.stringify(form) });
    setForm({ restaurantId: '', plan: 'weekly', copiesPerIssue: 50, pricePerCopy: 10000, unitCost: 4000 });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Удалить?')) return;
    await adminFetch(`/api/admin/magazine/subscriptions?id=${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="card" style={{ padding: 'var(--space-4)' }}>
      <form onSubmit={save} style={{ display: 'grid', gap: 'var(--space-3)', background: 'var(--bg-secondary)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          <select required className="input" value={form.restaurantId} onChange={e => setForm({...form, restaurantId: e.target.value})}>
            <option value="">Выберите ресторан...</option>
            {restaurants.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select className="input" value={form.plan} onChange={e => setForm({...form, plan: e.target.value})}>
            <option value="weekly">Еженедельно</option>
            <option value="biweekly">Раз в 2 недели</option>
            <option value="monthly">Ежемесячно</option>
          </select>
          <input required type="number" className="input" placeholder="Копий (тираж)" value={form.copiesPerIssue} onChange={e => setForm({...form, copiesPerIssue: Number(e.target.value)})} />
          <input required type="number" className="input" placeholder="Цена за копию (UZS)" value={form.pricePerCopy} onChange={e => setForm({...form, pricePerCopy: Number(e.target.value)})} />
          <input required type="number" className="input" placeholder="Себестоимость копии (UZS)" value={form.unitCost} onChange={e => setForm({...form, unitCost: Number(e.target.value)})} />
        </div>
        <button type="submit" style={{ background: 'var(--success)', color: '#fff', padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>+ Добавить подписку</button>
      </form>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
            <th style={{ padding: 'var(--space-2)' }}>Ресторан</th>
            <th style={{ padding: 'var(--space-2)' }}>План</th>
            <th style={{ padding: 'var(--space-2)' }}>Тираж</th>
            <th style={{ padding: 'var(--space-2)' }}>Цена/Копия</th>
            <th style={{ padding: 'var(--space-2)' }}>Действия</th>
          </tr>
        </thead>
        <tbody>
          {subs.map(s => (
            <tr key={s.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
              <td style={{ padding: 'var(--space-2)' }}>{s.restaurant?.name}</td>
              <td style={{ padding: 'var(--space-2)' }}>{s.plan}</td>
              <td style={{ padding: 'var(--space-2)' }}>{s.copiesPerIssue} шт</td>
              <td style={{ padding: 'var(--space-2)' }}>{s.pricePerCopy.toLocaleString()} UZS</td>
              <td style={{ padding: 'var(--space-2)' }}><button onClick={() => remove(s.id)} style={{ background: 'transparent', color: 'var(--error)', border: 'none', cursor: 'pointer' }}><Icons.Trash size={16} /></button></td>
            </tr>
          ))}
          {subs.length === 0 && <tr><td colSpan={5} style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-muted)' }}>Нет подписок</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ==========================================
// Тиражи (Print Orders)
// ==========================================
function OrdersTab() {
  const [orders, setOrders] = useState<any[]>([]);

  const load = async () => {
    setOrders(await (await adminFetch('/api/admin/magazine/print-orders')).json());
  };
  useEffect(() => { load(); }, []);

  const updateStatus = async (id: string, status: string) => {
    await adminFetch('/api/admin/magazine/print-orders', { method: 'PATCH', body: JSON.stringify({ id, status }) });
    load();
  };

  const markPaid = async (id: string) => {
    const provider = prompt("Провайдер оплаты? (click, payme, cash)", "cash");
    if (!provider) return;
    await adminFetch('/api/admin/magazine/print-orders', { method: 'PATCH', body: JSON.stringify({ id, status: 'paid', paymentProvider: provider }) });
    load();
  };

  return (
    <div className="card" style={{ padding: 'var(--space-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
        <h3 style={{ fontWeight: 'var(--font-bold)' }}>Заказы на тиражи (Автогенерируются по пятницам)</h3>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
            <th style={{ padding: 'var(--space-2)' }}>Выпуск</th>
            <th style={{ padding: 'var(--space-2)' }}>Тираж</th>
            <th style={{ padding: 'var(--space-2)' }}>Выручка</th>
            <th style={{ padding: 'var(--space-2)' }}>Маржа</th>
            <th style={{ padding: 'var(--space-2)' }}>Статус</th>
            <th style={{ padding: 'var(--space-2)' }}>Оплата</th>
            <th style={{ padding: 'var(--space-2)' }}>Действия</th>
          </tr>
        </thead>
        <tbody>
          {orders.map(o => (
            <tr key={o.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
              <td style={{ padding: 'var(--space-2)' }}>
                <strong>{o.restaurantIssue?.restaurant?.name}</strong>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>№{o.restaurantIssue?.edition?.weekNumber}</div>
              </td>
              <td style={{ padding: 'var(--space-2)' }}>{o.copies} шт</td>
              <td style={{ padding: 'var(--space-2)' }}>{o.revenue.toLocaleString()}</td>
              <td style={{ padding: 'var(--space-2)', color: 'var(--success)' }}>+{o.margin.toLocaleString()}</td>
              <td style={{ padding: 'var(--space-2)' }}>
                <select value={o.status} onChange={e => updateStatus(o.id, e.target.value)} style={{ padding: '2px 4px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                  <option value="pending">Ожидает</option>
                  <option value="paid">Оплачен</option>
                  <option value="printing">В печати</option>
                  <option value="shipped">Отправлен</option>
                  <option value="delivered">Доставлен</option>
                </select>
              </td>
              <td style={{ padding: 'var(--space-2)' }}>
                {o.paidAt ? (
                  <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>Да ({o.paymentProvider})</span>
                ) : (
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {o.payLinks?.click && <a href={o.payLinks.click} target="_blank" rel="noopener noreferrer" style={{ padding: '4px 8px', borderRadius: '4px', background: '#0099ff', color: '#fff', textDecoration: 'none', fontSize: '12px', fontWeight: 600 }}>💳 Click</a>}
                    {o.payLinks?.payme && <a href={o.payLinks.payme} target="_blank" rel="noopener noreferrer" style={{ padding: '4px 8px', borderRadius: '4px', background: '#33cc99', color: '#fff', textDecoration: 'none', fontSize: '12px', fontWeight: 600 }}>Payme</a>}
                    <button onClick={() => markPaid(o.id)} title="Отметить оплаченным вручную" style={{ padding: '4px 8px', borderRadius: '4px', background: 'var(--warning-bg)', color: 'var(--warning)', border: 'none', cursor: 'pointer', fontSize: '12px' }}>Отметить</button>
                  </div>
                )}
              </td>
              <td style={{ padding: 'var(--space-2)' }}>
                <a href={`/magazine/print/${o.restaurantIssue?.webSlug}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand-primary)' }}>🖨 Печать</a>
              </td>
            </tr>
          ))}
          {orders.length === 0 && <tr><td colSpan={7} style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-muted)' }}>Нет тиражей</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
