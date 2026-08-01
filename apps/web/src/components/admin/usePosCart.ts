'use client';

import { useState } from 'react';
import type { CartItem, Product } from './AdminPOSTypes';

// Корзина кассы. Вынесено из AdminPOS: файл перерос 200 строк.
//
// В режиме возврата ограничение по остатку не действует — возвращают то,
// что уже ушло со склада, и на витрине этого количества быть не обязано.

export function usePosCart(returnMode: boolean) {
  const [cart, setCart] = useState<CartItem[]>([]);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        if (!returnMode && existing.quantity >= product.stock) return prev;
        return prev.map(item =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      if (!returnMode && product.stock <= 0) return prev;
      return [...prev, { product, quantity: 1, customPrice: product.price }];
    });
  };

  const updatePrice = (productId: string, newPrice: number) => {
    if (newPrice <= 0) return;
    setCart(prev => prev.map(item =>
      item.product.id === productId ? { ...item, customPrice: newPrice } : item
    ));
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev =>
      prev
        .map(item => {
          if (item.product.id !== productId) return item;
          const newQty = item.quantity + delta;
          if (newQty <= 0) return null;
          if (newQty > item.product.stock) return item;
          return { ...item, quantity: newQty };
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const total = cart.reduce((sum, item) => sum + item.customPrice * item.quantity, 0);

  return { cart, setCart, addToCart, updatePrice, updateQuantity, removeFromCart, total };
}
