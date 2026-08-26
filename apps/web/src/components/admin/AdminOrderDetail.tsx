'use client';

import { ArrowLeft, Package, Settings, Wallet } from 'lucide-react';
import { PAYMENT_STATUS_CONFIG, STATUS_CONFIG } from './adminOrdersConfig';
import type { Order } from './adminOrderTypes';
import { tint } from '@/lib/tint';

// Карточка одного заказа: кто, что, на сколько и смена статуса.
// Вынесена из AdminOrders — там осталась выборка списка, поиск и страницы.

export function AdminOrderDetail({ order, onBack, onStatus, onPaymentStatus, fmt, fmtDate }: {
  order: Order;
  onBack: () => void;
  onStatus: (status: string) => void;
  onPaymentStatus: (paymentStatus: string) => void;
  fmt: (n: number) => string;
  fmtDate: (d: string) => string;
}) {
  const st = STATUS_CONFIG[order.status] || STATUS_CONFIG.PENDING;
  const pay = PAYMENT_STATUS_CONFIG[order.paymentStatus] || PAYMENT_STATUS_CONFIG.PENDING;

  return (
    <div>
      <button onClick={onBack} className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <ArrowLeft size={16} /> Orqaga
      </button>
      <div className="card" style={{ padding: 'var(--space-6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)' }}>#{order.orderNumber}</h3>
          <span style={{ padding: '4px 12px', borderRadius: 'var(--radius-full)', background: tint(st.color), color: st.color, fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {st.icon} {st.label}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
          <div><span style={{ color: 'var(--text-muted)' }}>Mijoz:</span> <strong>{order.user?.firstName || 'Noma\'lum'}</strong></div>
          <div><span style={{ color: 'var(--text-muted)' }}>Telefon:</span> <strong>{order.phone}</strong></div>
          <div><span style={{ color: 'var(--text-muted)' }}>Manzil:</span> <strong>{order.address}</strong></div>
          <div><span style={{ color: 'var(--text-muted)' }}>Sana:</span> <strong>{fmtDate(order.createdAt)}</strong></div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>To&apos;lov:</span>{' '}
            <strong>{order.paymentMethod}</strong>{' '}
            <span style={{ color: pay.color, fontWeight: 'var(--font-semibold)' }}>· {pay.label}</span>
          </div>
          {order.note && <div style={{ gridColumn: '1/-1' }}><span style={{ color: 'var(--text-muted)' }}>Izoh:</span> <strong>{order.note}</strong></div>}
        </div>

        <h4 style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Package size={16} /> Mahsulotlar
        </h4>
        <div style={{ marginBottom: 'var(--space-4)' }}>
          {order.items.map(item => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--border)', fontSize: 'var(--text-sm)' }}>
              <span>{item.quantity}x {item.product.nameUz}</span>
              <span style={{ fontWeight: 'var(--font-semibold)' }}>{fmt(item.price * item.quantity)} so&apos;m</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 'var(--space-3)', fontWeight: 'var(--font-bold)' }}>
            <span>Jami:</span>
            <span style={{ color: 'var(--brand-primary)' }}>{fmt(order.total)} so&apos;m</span>
          </div>
        </div>

        {/* Status actions */}
        <h4 style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Settings size={16} /> Statusni o&apos;zgartirish
        </h4>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {Object.entries(STATUS_CONFIG).filter(([k]) => k !== order.status).map(([key, cfg]) => (
            <button key={key} onClick={() => onStatus(key)} className="btn btn-sm"
              style={{ border: `1px solid ${cfg.color}`, color: cfg.color, display: 'flex', alignItems: 'center', gap: '4px' }}>
              {cfg.icon} {cfg.label}
            </button>
          ))}
        </div>

        {/* Оплата. Отдельная ось: заказ доставлен — ещё не значит оплачен, и
            наоборот. Раньше это состояние было видно, но не менялось ничем:
            ручка в API была, кнопки не было. */}
        <h4 style={{ fontWeight: 'var(--font-semibold)', margin: 'var(--space-4) 0 var(--space-2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Wallet size={16} /> To&apos;lov holati
        </h4>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {Object.entries(PAYMENT_STATUS_CONFIG).filter(([k]) => k !== order.paymentStatus).map(([key, cfg]) => (
            <button key={key} onClick={() => onPaymentStatus(key)} className="btn btn-sm"
              style={{ border: `1px solid ${cfg.color}`, color: cfg.color, display: 'flex', alignItems: 'center', gap: '4px' }}>
              {cfg.icon} {cfg.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
