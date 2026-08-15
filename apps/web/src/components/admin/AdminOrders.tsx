'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, ClipboardList, Clock, Folder } from 'lucide-react';
import { STATUS_CONFIG, STATUS_TABS } from './adminOrdersConfig';
import { AdminOrderDetail } from './AdminOrderDetail';
import type { Order } from './adminOrderTypes';
import { AdminPager } from './AdminPager';

interface OrdersPage {
  orders: Order[];
  total: number;
}

/** Заказов на странице. По умолчанию API отдаёт 20 — этого мало даже на день.
 *  Листаем страницами, а не «показать ещё»: limit на сервере ограничен сотней,
 *  и накопительная кнопка молча перестала бы догружать. */
const PAGE_SIZE = 50;

export function AdminOrders({ focus = '' }: { focus?: string }) {
  const [activeTab, setActiveTab] = useState('ALL');
  const [selected, setSelected] = useState<Order | null>(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [phone, setPhone] = useState('');
  const [page, setPage] = useState(1);
  /** Заказ из ссылки открыт до первого «назад», дальше работает список. */
  const [dismissedFocus, setDismissedFocus] = useState('');

  // Раньше запрос шёл без параметров, а API по умолчанию отдаёт 20 записей:
  // экран показывал последние двадцать заказов и молчал об остальных. Найти
  // заказы конкретного клиента было нечем — фильтр по телефону API умел
  // всегда, но его никто не передавал.
  const { data, isLoading: loading, refetch: fetchOrders } = useQuery<OrdersPage>({
    queryKey: ['admin-orders', activeTab, phone, page],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) });
      if (activeTab !== 'ALL') params.set('status', activeTab);
      if (phone) params.set('phone', phone);
      const res = await fetch(`/api/orders?${params}`);
      const body = await res.json();
      return { orders: body.orders || [], total: body.total ?? 0 };
    }
  });

  const orders = data?.orders ?? [];

  // Пришли по ссылке из Telegram (`?focus=`) — сразу раскрываем этот заказ.
  // Выводим из данных, а не эффектом: заказ появляется вместе со страницей
  // списка, и лишний прогон рендера ради setState тут не нужен. Сверяем и по
  // id, и по номеру — ИИ-офис оперирует номером «MG-000001», витрина cuid'ом.
  const focused =
    focus && focus !== dismissedFocus
      ? orders.find((o) => o.id === focus || o.orderNumber === focus) ?? null
      : null;
  const current = selected ?? focused;

  const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');
  const fmtDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  /** Закрыть карточку — и ту, что открыла ссылка из Telegram, тоже. */
  const closeDetail = () => {
    setSelected(null);
    if (focused) setDismissedFocus(focus);
  };

  const updateStatus = async (orderId: string, newStatus: string) => {
    try {
      await fetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orderId, status: newStatus }),
      });
      fetchOrders();
      if (current?.id === orderId) closeDetail();
    } catch (err) {
      console.error('Status update error:', err);
    }
  };

  if (current) {
    return (
      <AdminOrderDetail
        order={current}
        onBack={closeDetail}
        onStatus={(status) => updateStatus(current.id, status)}
        fmt={fmt}
        fmtDate={fmtDate}
      />
    );
  }

  return (
    <div>
      {/* Status tabs */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)', overflowX: 'auto', paddingBottom: 4 }}>
        {STATUS_TABS.map(tab => (
          <button key={tab} onClick={() => { setActiveTab(tab); setPage(1); }} className={`btn btn-sm ${activeTab === tab ? 'btn-primary' : 'btn-ghost'}`}
            style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {tab === 'ALL' ? <><ClipboardList size={14} /> Barchasi</> : <>{STATUS_CONFIG[tab]?.icon} {STATUS_CONFIG[tab]?.label}</>}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); setPage(1); setPhone(phoneInput.trim()); }}
        style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}
      >
        <input
          type="text"
          value={phoneInput}
          onChange={(e) => setPhoneInput(e.target.value)}
          placeholder="Поиск по телефону клиента"
          style={{
            flex: '1 1 220px', minWidth: 0,
            padding: 'var(--space-2) var(--space-3)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontSize: 'var(--text-sm)',
          }}
        />
        <button type="submit" className="btn btn-sm btn-primary">Найти</button>
        {phone && (
          <button type="button" className="btn btn-sm btn-ghost"
            onClick={() => { setPhoneInput(''); setPhone(''); setPage(1); }}>
            Сбросить
          </button>
        )}
      </form>

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

      {!loading && (data?.total ?? 0) > 0 && (
        <AdminPager
          page={page}
          total={data?.total ?? 0}
          pageSize={PAGE_SIZE}
          onPage={setPage}
        />
      )}
    </div>
  );
}
