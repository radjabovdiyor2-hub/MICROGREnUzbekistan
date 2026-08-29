import React from 'react';
import { ArrowLeft, ArrowRight, Package, Settings, Trash } from 'lucide-react';

export interface Movement {
  id: string;
  type: string;
  quantity: number;
  reason: string | null;
  note: string | null;
  costPrice: number | null;
  performedBy: string | null;
  createdAt: string;
  product: { nameUz: string; nameRu: string; price: number; stock: number };
  supplier?: { name: string } | null;
}

export interface Product {
  id: string;
  nameUz: string;
  stock: number;
  price: number;
}

/**
 * Шапка чека: кто продал и кому.
 *
 * Обе величины лежат в `pos_sales` с самого появления таблицы, а история
 * продаж показывала только номер, время и сумму. Пустой `performedBy`
 * означает чек, записанный до появления шапки, — не «продавец неизвестен
 * по злому умыслу», а «строка старая».
 */
export interface ReceiptHead {
  customerId: number | null;
  customerName: string | null;
  performedBy: string | null;
  role: string | null;
  paymentMethod: string | null;
  /** `counter` — за прилавком, `field` — с выезда по карте. */
  origin: string | null;
  discount: number;
  discountReason: string | null;
  backdated: boolean;
  backdateReason: string | null;
  /** Причина возврата — только у возвратов. */
  reason: string | null;
  /** Номер чека, по которому сделан возврат. */
  refundOf: string | null;
}

export interface Sale extends ReceiptHead {
  number: string;
  items: { quantity: number; product: { nameUz: string; price: number } }[];
  total: number;
  time: string;
  itemCount: number;
}

export const TYPE_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  IN: { label: 'Kirim', color: 'var(--success)', icon: <ArrowRight size={14} /> },
  OUT: { label: 'Chiqim', color: 'var(--error)', icon: <ArrowLeft size={14} /> },
  ADJUSTMENT: { label: 'Tuzatish', color: 'var(--info)', icon: <Settings size={14} /> },
  RETURN: { label: 'Qaytarish', color: 'var(--cat-2)', icon: <Package size={14} /> },
  WRITE_OFF: { label: 'Hisobdan chiqarish', color: 'var(--warning)', icon: <Trash size={14} /> },
};
