'use client';

import React from 'react';
import { AdminPOSCartRow } from './AdminPOSCartRow';
import type { CartItem } from './AdminPOSTypes';

// Список позиций чека. Сама строка — в AdminPOSCartRow: с редактируемым
// количеством файл переставал помещаться в 200 строк.

interface Props {
  cart: CartItem[];
  editingPriceId: string | null;
  setEditingPriceId: (id: string | null) => void;
  editPriceValue: string;
  setEditPriceValue: (v: string) => void;
  updateQuantity: (id: string, direction: number) => void;
  setQuantity: (id: string, value: number) => void;
  updatePrice: (id: string, newPrice: number) => void;
  setPriceReason: (id: string, reason: string) => void;
  removeFromCart: (id: string) => void;
  fmt: (n: number) => string;
}

export function AdminPOSCartItems({ cart, ...rowProps }: Props) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', marginBottom: 'var(--space-4)' }}>
      {cart.map(item => (
        <AdminPOSCartRow key={item.product.id} item={item} {...rowProps} />
      ))}
    </div>
  );
}
