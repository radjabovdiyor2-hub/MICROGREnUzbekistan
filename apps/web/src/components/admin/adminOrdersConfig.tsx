// Оформление статусов заказа и набор вкладок. Вынесено из AdminOrders —
// чистые данные без состояния. Файл .tsx, а не .ts: в конфигурации
// статусов лежат иконки, то есть JSX.

import React from 'react';
import {
  CheckCircle, Clock, Package, PartyPopper, Truck, XCircle,
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
