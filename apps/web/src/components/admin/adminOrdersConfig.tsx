// Оформление статусов заказа и набор вкладок. Вынесено из AdminOrders —
// чистые данные без состояния. Файл .tsx, а не .ts: в конфигурации
// статусов лежат иконки, то есть JSX.

import React from 'react';
import {
  CheckCircle, Clock, Package, PartyPopper, Truck, Undo2, Wallet, XCircle,
} from 'lucide-react';

// ⚠️ ПОДПИСЬ ЗДЕСЬ ДВУЯЗЫЧНАЯ, и это не украшение. Экран заказов написан
// по-русски, а статусы в нём были только узбекскими: «Заказы», «Поиск по
// телефону» — и рядом «Kutilmoqda». Кнопка переключения языка в сайдбаре
// при этом есть и на такую подпись не влияла никак: варианта на втором
// языке просто не существовало.
//
// `label` оставлен как поле — на него смотрит и офис, и он же уходит в
// сообщения; `labelRu`/`labelUz` выбирает экран по своему языку.
export interface StatusLabel {
  label: string;
  labelRu: string;
  labelUz: string;
  color: string;
  icon: React.ReactNode;
}

export const STATUS_CONFIG: Record<string, StatusLabel> = {
  PENDING: { label: 'Kutilmoqda', labelRu: 'Ожидает', labelUz: 'Kutilmoqda', color: 'var(--warning)', icon: <Clock size={14} /> },
  CONFIRMED: { label: 'Tasdiqlandi', labelRu: 'Подтверждён', labelUz: 'Tasdiqlandi', color: 'var(--info)', icon: <CheckCircle size={14} /> },
  PREPARING: { label: 'Tayyorlanmoqda', labelRu: 'Собирается', labelUz: 'Tayyorlanmoqda', color: 'var(--cat-2)', icon: <Package size={14} /> },
  DELIVERING: { label: 'Yetkazilmoqda', labelRu: 'В доставке', labelUz: 'Yetkazilmoqda', color: 'var(--cat-5)', icon: <Truck size={14} /> },
  DELIVERED: { label: 'Yetkazildi', labelRu: 'Доставлен', labelUz: 'Yetkazildi', color: 'var(--success)', icon: <PartyPopper size={14} /> },
  CANCELLED: { label: 'Bekor qilindi', labelRu: 'Отменён', labelUz: 'Bekor qilindi', color: 'var(--error)', icon: <XCircle size={14} /> },
};

/** Подпись статуса на языке экрана. */
export function statusLabel(status: string, lang: 'ru' | 'uz'): string {
  const cfg = STATUS_CONFIG[status];
  if (!cfg) return status;
  return lang === 'ru' ? cfg.labelRu : cfg.labelUz;
}

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
export const PAYMENT_STATUS_CONFIG: Record<string, StatusLabel> = {
  PENDING: { label: "To'lanmagan", labelRu: 'Не оплачен', labelUz: "To'lanmagan", color: 'var(--warning)', icon: <Clock size={14} /> },
  PAID: { label: "To'landi", labelRu: 'Оплачен', labelUz: "To'landi", color: 'var(--success)', icon: <Wallet size={14} /> },
  FAILED: { label: 'Xatolik', labelRu: 'Ошибка', labelUz: 'Xatolik', color: 'var(--error)', icon: <XCircle size={14} /> },
  REFUNDED: { label: 'Qaytarildi', labelRu: 'Возврат', labelUz: 'Qaytarildi', color: 'var(--text-muted)', icon: <Undo2 size={14} /> },
};
