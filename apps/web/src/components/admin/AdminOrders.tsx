'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, ChevronRight, ClipboardList, Clock, Folder, Package, Settings } from 'lucide-react';

interface OrderItem {
  id: string;
  quantity: number;
  price: number;
  product: { nameUz: string; nameRu: string };
}

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  subtotal: number;
  deliveryFee: number;
  phone: string;
  address: string;
  note: string | null;
  paymentMethod: string;
  paymentStatus: string;
  createdAt: string;
  user: { firstName: string | null; phone: string | null };
  items: OrderItem[];
}

import { STATUS_CONFIG, STATUS_TABS } from './adminOrdersConfig';

export function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ALL');
  const [selected, setSelected] = useState<Order | null>(null);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const url = activeTab === 'ALL' ? '/api/orders' : `/api/orders?status=${activeTab}`;
      const res = await fetch(url);
      const data = await res.json();
      setOrders(data.orders || []);
    } catch (err) {
      console.error('Orders fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrders(); }, [activeTab]);

  const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');
  const fmtDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const updateStatus = async (orderId: string, newStatus: string) => {
    try {
      await fetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orderId, status: newStatus }),
      });
      fetchOrders();
      if (selected?.id === orderId) setSelected(null);
    } catch (err) {
      console.error('Status update error:', err);
    }
  };

  // Order detail modal
  if (selected) {
    const st = STATUS_CONFIG[selected.status] || STATUS_CONFIG.PENDING;
    return (
      <div>
        <button onClick={() => setSelected(null)} className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ArrowLeft size={16} /> Orqaga
        </button>
        <div className="card" style={{ padding: 'var(--space-6)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)' }}>#{selected.orderNumber}</h3>
            <span style={{ padding: '4px 12px', borderRadius: 'var(--radius-full)', background: `${st.color}15`, color: st.color, fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              {st.icon} {st.label}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
            <div><span style={{ color: 'var(--text-muted)' }}>Mijoz:</span> <strong>{selected.user?.firstName || 'Noma\'lum'}</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Telefon:</span> <strong>{selected.phone}</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Manzil:</span> <strong>{selected.address}</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Sana:</span> <strong>{fmtDate(selected.createdAt)}</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>To&apos;lov:</span> <strong>{selected.paymentMethod}</strong></div>
            {selected.note && <div style={{ gridColumn: '1/-1' }}><span style={{ color: 'var(--text-muted)' }}>Izoh:</span> <strong>{selected.note}</strong></div>}
          </div>

          <h4 style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Package size={16} /> Mahsulotlar
          </h4>
          <div style={{ marginBottom: 'var(--space-4)' }}>
            {selected.items.map(item => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--border)', fontSize: 'var(--text-sm)' }}>
                <span>{item.quantity}x {item.product.nameUz}</span>
                <span style={{ fontWeight: 'var(--font-semibold)' }}>{fmt(item.price * item.quantity)} so&apos;m</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 'var(--space-3)', fontWeight: 'var(--font-bold)' }}>
              <span>Jami:</span>
              <span style={{ color: 'var(--brand-primary)' }}>{fmt(selected.total)} so&apos;m</span>
            </div>
          </div>

          {/* Status actions */}
          <h4 style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Settings size={16} /> Statusni o&apos;zgartirish
          </h4>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {Object.entries(STATUS_CONFIG).filter(([k]) => k !== selected.status).map(([key, cfg]) => (
              <button key={key} onClick={() => updateStatus(selected.id, key)} className="btn btn-sm"
                style={{ border: `1px solid ${cfg.color}`, color: cfg.color, display: 'flex', alignItems: 'center', gap: '4px' }}>
                {cfg.icon} {cfg.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Status tabs */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)', overflowX: 'auto', paddingBottom: 4 }}>
        {STATUS_TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`btn btn-sm ${activeTab === tab ? 'btn-primary' : 'btn-ghost'}`}
            style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {tab === 'ALL' ? <><ClipboardList size={14} /> Barchasi</> : <>{STATUS_CONFIG[tab]?.icon} {STATUS_CONFIG[tab]?.label}</>}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
          <Clock size={32} style={{ animation: 'pulse 1.5s infinite', marginBottom: 'var(--space-2)' }} />
          <p>Yuklanmoqda...</p>
        </div>
      ) : orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
          <Folder size={48} style={{ marginBottom: 'var(--space-2)' }} />
          <p>Buyurtmalar topilmadi</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {orders.map(order => {
            const st = STATUS_CONFIG[order.status] || STATUS_CONFIG.PENDING;
            return (
              <div key={order.id} className="card" onClick={() => setSelected(order)}
                style={{ padding: 'var(--space-4)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 'var(--space-4)', transition: 'all var(--transition-fast)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 2 }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)' }}>#{order.orderNumber}</span>
                    <span style={{
                      padding: '2px 8px', borderRadius: 'var(--radius-full)',
                      background: `${st.color}15`, color: st.color,
                      fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)',
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                    }}>
                      {st.icon} {st.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    {order.user?.firstName || 'Mijoz'} · {order.phone} · {fmtDate(order.createdAt)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', color: 'var(--brand-primary)' }}>
                    {fmt(order.total)} so&apos;m
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    {order.items.length} ta mahsulot
                  </div>
                </div>
                <ChevronRight size={20} style={{ color: 'var(--text-muted)' }} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
