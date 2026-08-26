// Оформление статусов заказа и набор вкладок. Вынесено из AdminOrders —
// чистые данные без состояния. Файл .tsx, а не .ts: в конфигурации
// статусов лежат иконки, то есть JSX.

import React from 'react';
import {
  CheckCircle, Clock, Package, PartyPopper, Truck, Undo2, Wallet, XCircle,
} from 'lucide-react';

export const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  PENDING: { label: 'Kutilmoqda', color: 'var(--warning)', icon: <Clock size={14} /> },
  CONFIRMED: { label: 'Tasdiqlandi', color: 'var(--info)', icon: <CheckCircle size={14} /> },
  PREPARING: { label: 'Tayyorlanmoqda', color: 'var(--cat-2)', icon: <Package size={14} /> },
  DELIVERING: { label: 'Yetkazilmoqda', color: 'var(--cat-5)', icon: <Truck size={14} /> },
  DELIVERED: { label: 'Yetkazildi', color: 'var(--success)', icon: <PartyPopper size={14} /> },
  CANCELLED: { label: 'Bekor qilindi', color: 'var(--error)', icon: <XCircle size={14} /> },
};

export const STATUS_TABS = ['ALL', 'PENDING', 'CONFIRMED', 'PREPARING', 'DELIVERING', 'DELIVERED', 'CANCELLED'];

// Статус ОПЛАТЫ — отдельная ось от статуса заказа, и до этого её было негде
// поменять. `PUT /api/orders { paymentStatus }` существовал и работал, но его
// не звал ни один экран: карточка заказа показывала способ оплаты строкой и
// меняла только статус. Наличная оплата навсегда оставалась `PENDING`, то
// есть по данным системы деньги за доставленный заказ так и не пришли.
//
// REFUNDED здесь есть, а «частично оплачен» нет: последнего не знает и
// схема (`enum PaymentStatus`), а рисовать состояние, которого база не
// хранит, значит обещать учёт, которого нет.
export const PAYMENT_STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  PENDING: { label: "To'lanmagan", color: 'var(--warning)', icon: <Clock size={14} /> },
  PAID: { label: "To'landi", color: 'var(--success)', icon: <Wallet size={14} /> },
  FAILED: { label: 'Xatolik', color: 'var(--error)', icon: <XCircle size={14} /> },
  REFUNDED: { label: 'Qaytarildi', color: 'var(--text-muted)', icon: <Undo2 size={14} /> },
};
