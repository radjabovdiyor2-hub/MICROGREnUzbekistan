'use client';

import { useState } from 'react';
import { cartTotal, isValidQty, normalizeQty, stepFor } from '@/lib/qty';
import type { CartItem, ContractPrice, Product } from './AdminPOSTypes';

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
//
// КОЛИЧЕСТВО ДРОБНОЕ, А ШАГ ЗАВИСИТ ОТ ЕДИНИЦЫ. Кнопки ± прибавляют 0.1 у
// весового товара и ровно 1 у штучного (`lib/qty#stepFor`): салат продаётся
// за килограмм, и 1.3 кг — обычная продажа. Раньше шаг был жёстко единичным,
// и весовой товар можно было продать только целыми килограммами.

/** Причина уступки для договорной цены — заполняется сама. */
const contractReason = (contract: ContractPrice): string =>
  contract.note ? `Договорная цена клиента: ${contract.note}` : 'Договорная цена клиента';

export function usePosCart() {
  const [cart, setCart] = useState<CartItem[]>([]);
  // Договорные цены выбранного покупателя: id товара → цена. Пустая карта —
  // покупатель не выбран, всё продаётся по прайсу.
  const [contract, setContract] = useState<Map<string, ContractPrice>>(new Map());

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: normalizeQty(item.quantity + stepFor(product.unit)) }
            : item
        );
      }
      // Первая порция — ровно одна единица, а не шаг: «1 кг» ожидаемее, чем
      // «0.1 кг», и дальше количество набирается кнопками или вводится числом.
      const agreed = contract.get(product.id);
      return [...prev, {
        product,
        quantity: 1,
        customPrice: agreed?.price ?? product.price,
        priceReason: agreed ? contractReason(agreed) : undefined,
      }];
    });
  };

  const updatePrice = (productId: string, newPrice: number) => {
    if (newPrice <= 0) return;
    setCart(prev => prev.map(item => {
      if (item.product.id !== productId) return item;
      // Вернули прайсовую цену — причина уступки больше не нужна и не должна
      // уехать на сервер: иначе в журнале осталось бы объяснение скидки,
      // которой нет.
      const priceReason = newPrice === item.product.price ? undefined : item.priceReason;
      return { ...item, customPrice: newPrice, priceReason };
    }));
  };

  const setPriceReason = (productId: string, reason: string) => {
    setCart(prev => prev.map(item =>
      item.product.id === productId ? { ...item, priceReason: reason } : item
    ));
  };

  /** Шаг вверх или вниз: `direction` — это +1 или -1, а не количество. */
  const updateQuantity = (productId: string, direction: number) => {
    setCart(prev =>
      prev
        .map(item => {
          if (item.product.id !== productId) return item;
          const step = stepFor(item.product.unit);
          // Нормализация обязательна: 0.1 + 0.2 в double даёт
          // 0.30000000000000004, и хвост копился бы с каждым нажатием.
          const newQty = normalizeQty(item.quantity + direction * step);
          if (newQty <= 0) return null;
          return { ...item, quantity: newQty };
        })
        .filter(Boolean) as CartItem[]
    );
  };

  /** Ввод количества числом — «1.3» набирать кнопками по 0.1 никто не станет. */
  const setQuantity = (productId: string, value: number) => {
    const normalized = normalizeQty(value);
    if (!isValidQty(normalized)) return;
    setCart(prev => prev.map(item =>
      item.product.id === productId ? { ...item, quantity: normalized } : item
    ));
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  // Сумма чека — через общий помощник: позиции округляются по одной, и
  // только потом складываются. Округление общей суммы в конце дало бы
  // другое число, и чек разошёлся бы со складским журналом.
  const total = cartTotal(cart.map(item => ({ price: item.customPrice, quantity: item.quantity })));

  /**
   * Сменить покупателя: договорные цены применяются к уже набранному чеку.
   *
   * Не применить их к тому, что уже в корзине, значило бы продать половину
   * чека по прайсу — ровно та ошибка, ради которой договорная цена и заводится.
   * Ручную уступку не трогаем: её продавец поставил осознанно.
   */
  const applyContract = (prices: Map<string, ContractPrice>) => {
    setContract(prices);
    setCart(prev => prev.map(item => {
      const agreed = prices.get(item.product.id);
      if (!agreed) return item;
      const manual = item.customPrice !== item.product.price
        && item.priceReason
        && !item.priceReason.startsWith('Договорная цена клиента');
      if (manual) return item;
      return { ...item, customPrice: agreed.price, priceReason: contractReason(agreed) };
    }));
  };

  return {
    cart, setCart, addToCart, updatePrice, setPriceReason, applyContract,
    updateQuantity, setQuantity, removeFromCart, total,
  };
}
