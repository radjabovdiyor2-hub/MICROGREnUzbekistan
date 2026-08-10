'use client';

import { useState } from 'react';
import type { CartItem, Product } from './AdminPOSTypes';

// Корзина кассы. Вынесено из AdminPOS: файл перерос 200 строк.
//
// ОСТАТОК НЕ ЗАПРЕЩАЕТ ПРОДАЖУ. Раньше касса молча не добавляла товар с нулём
// и не давала набрать больше остатка: `return prev` без единого слова — для
// продавца это выглядело как сломанная кнопка. А остаток на кассе почти
// всегда отстаёт от жизни: товар лежит на прилавке, в базе ноль. Отказ по
// устаревшему числу срывает настоящую продажу.
//
// Сайт в этой же ситуации заказ принимает (микрозелень растят под заказ,
// см. lib/orders/afterCreate.ts). После перехода каталога на прайс все
// остатки стали нулевыми, и касса перестала продавать вообще.
//
// Теперь количество набирается свободно, а нехватку показывает сама карточка
// позиции — числом, а не запретом. Из-за этого исчез и параметр `returnMode`:
// он существовал только чтобы снимать проверку остатка при возврате, а
// проверки больше нет ни в одном из режимов.

export function usePosCart() {
  const [cart, setCart] = useState<CartItem[]>([]);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
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
