'use client';

import { Package, ShoppingBag } from 'lucide-react';
import type { CustomerCardOrder } from '@/lib/customers/card';

// История заказов клиента. Её в разделе «Клиенты» не было вовсе: таблица
// показывала счётчик «Заказов: 7», а самих заказов не было нигде — при том,
// что шапка раздела обещала «Просмотр заказов».
//
// Источник — `crm_orders`: через зеркало витрины проходит каждый заказ, и с
// сайта, и оформленный менеджером, поэтому список полный.

/** Подписи статусов CRM (`_ALLOWED_ORDER_STATUS` в web_office/main.py). */
const STATUS_LABELS: Record<string, string> = {
  new: 'Новый',
  confirmed: 'Подтверждён',
  preparing: 'Собирается',
  ready: 'Готов',
  delivering: 'В пути',
  delivered: 'Доставлен',
  cancelled: 'Отменён',
};

const PAYMENT_LABELS: Record<string, string> = {
  paid: 'оплачен',
  pending: 'не оплачен',
  refunded: 'возврат',
};

function statusColor(status: string): string {
  if (status === 'delivered') return 'var(--success)';
  if (status === 'cancelled') return 'var(--error)';
  if (status === 'new') return 'var(--text-muted)';
  return 'var(--warning)';
}

const fmtMoney = (n: number) => n.toLocaleString('ru-RU');
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

export function AdminCustomerOrders({ orders }: { orders: CustomerCardOrder[] }) {
  if (orders.length === 0) {
    return (
      <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
        <ShoppingBag size={32} style={{ margin: '0 auto var(--space-2)' }} />
        <div style={{ fontSize: 'var(--text-sm)' }}>У этого клиента ещё нет заказов</div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 'var(--space-4)' }}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-3)' }}>
        <Package size={18} /> История заказов
        <span style={{ color: 'var(--text-muted)', fontWeight: 'var(--font-normal)', fontSize: 'var(--text-sm)' }}>
          ({orders.length})
        </span>
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {orders.map((o) => {
          const cancelled = o.status === 'cancelled';
          return (
            <div
              key={o.id}
              style={{
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                // Отменённый показываем, но приглушаем: иначе непонятно,
                // почему сумма в шапке не сходится с суммой строк.
                opacity: cancelled ? 0.65 : 1,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 'var(--font-semibold)' }}>
                  {o.orderNumber || `#${o.id}`}
                </span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  {fmtDate(o.createdAt)}
                </span>
                <span style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 'var(--font-semibold)',
                  color: statusColor(o.status),
                  whiteSpace: 'nowrap',
                }}>
                  {STATUS_LABELS[o.status] || o.status}
                  {o.paymentStatus && PAYMENT_LABELS[o.paymentStatus]
                    ? ` · ${PAYMENT_LABELS[o.paymentStatus]}`
                    : ''}
                </span>
                <span style={{
                  marginLeft: 'auto',
                  fontWeight: 'var(--font-bold)',
                  whiteSpace: 'nowrap',
                  textDecoration: cancelled ? 'line-through' : undefined,
                }}>
                  {fmtMoney(o.total)} сум
                </span>
              </div>

              {o.items.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                  {o.items.join(', ')}
                </div>
              )}
              {o.deliveryAddress && (
                <div style={{ marginTop: 4, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  {o.deliveryAddress}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
