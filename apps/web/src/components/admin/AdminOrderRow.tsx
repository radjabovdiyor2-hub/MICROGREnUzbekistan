'use client';

import { ChevronRight } from 'lucide-react';

import { STATUS_CONFIG, statusLabel } from './adminOrdersConfig';
import { AdminCheckbox } from './AdminCheckbox';
import type { Order } from './adminOrderTypes';
import { tint } from '@/lib/tint';

// Строка списка заказов. Вынесена из AdminOrders: с флажком выбора экран
// перерос 200 строк — а он и до того был 227.

export function AdminOrderRow({ order, picked, onPick, onOpen, fmt, fmtDate, lang = 'ru' }: {
  order: Order;
  picked: boolean;
  onPick: () => void;
  onOpen: () => void;
  fmt: (n: number) => string;
  fmtDate: (iso: string) => string;
  lang?: 'ru' | 'uz';
}) {
  const st = STATUS_CONFIG[order.status] || STATUS_CONFIG.PENDING;

  return (
    <div
      className="card"
      onClick={onOpen}
      style={{
        padding: 'var(--space-4)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4)',
        transition: 'all var(--transition-fast)',
        // Обводка, а не заливка: у строки уже есть цветная плашка статуса,
        // и заливка спорила бы с ней.
        ...(picked ? { outline: '2px solid var(--brand-primary)', outlineOffset: -2 } : {}),
      }}
    >
      {/* Выбор пачкой: владелец обрабатывает десятки заказов в день, а
          статус менялся по одному — открыть карточку, нажать, закрыть. */}
      <AdminCheckbox
        checked={picked}
        onChange={onPick}
        label={lang === 'ru'
          ? `Выбрать заказ ${order.orderNumber}`
          : `${order.orderNumber} buyurtmasini tanlash`}
      />

      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 2 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)' }}>
            #{order.orderNumber}
          </span>
          <span style={{
            padding: '2px 8px', borderRadius: 'var(--radius-full)',
            background: tint(st.color), color: st.color,
            fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)',
            display: 'inline-flex', alignItems: 'center', gap: '4px',
          }}>
            {st.icon} {statusLabel(order.status, lang)}
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
}
