'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  readContractSnapshot,
  readPriceSnapshot,
  saveContractSnapshot,
  savePriceSnapshot,
} from '@/lib/pos/priceSnapshot';

import { fetchContractPrices } from './posApi';
import { usePosCart } from './usePosCart';
import { usePosSubmit, type SaleResultState } from './usePosSubmit';
import type { ContractPrice, PosCustomer, Product } from './AdminPOSTypes';

// ══════════════════════════════════════════════════════════════════════
// Ядро кассы: прайс, корзина, покупатель, оформление чека.
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ ХУК
//
// Касс в проекте две — вкладка «Продажи» и лист продажи на точке карты, —
// но касса должна остаться ОДНА. Разъедься они, и продажа с выезда через
// месяц перестала бы, например, требовать причину уступки: проверки живут
// в usePosSubmit, а прайс и договорные цены грузятся здесь.
//
// Оболочки отличаются только разметкой: где стоит поиск, как выглядит
// корзина, что показывать после чека. Всё остальное — общее.
// ══════════════════════════════════════════════════════════════════════

interface Options {
  /**
   * Покупатель, известный заранее.
   *
   * На карте продажа начинается с точки, то есть с клиента: искать его в
   * поиске второй раз — лишний шаг ровно там, где человек стоит в чужом
   * дворе с телефоном в руке.
   */
  initialCustomer?: PosCustomer | null;
  origin: 'counter' | 'field';
  sellerName: string;
  onSale?: (result: SaleResultState) => void;
}

export function usePosSession({ initialCustomer = null, origin, sellerName, onSale }: Options) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [customer, setCustomer] = useState<PosCustomer | null>(initialCustomer);

  const cart = usePosCart();

  const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

  // Дебаунс — на ВВОД, а не на запрос. Прежний таймер стоял на самом
  // запросе, поэтому касса ждала 300 мс даже при первом открытии, когда
  // искать ещё нечего.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Тот же ключ, что у экрана «Товары»: продажа и правка карточки
  // инвалидируют его одинаково, и касса подхватывает новую цену сразу.
  const { data: fresh, isPending: loading, isError } = useQuery<Product[]>({
    queryKey: ['admin-products', 'pos', debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      params.set('limit', '50');
      const res = await fetch(`/api/products?${params}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Не удалось загрузить товары');
      const data = await res.json();
      const items = (data.items || []) as Product[];
      // Снимок обновляем ТОЛЬКО на полном прайсе: сохранить сюда результат
      // поиска по слову значило бы уехать в поле с тремя товарами.
      if (!debouncedSearch) savePriceSnapshot(items);
      return items;
    },
  });

  // Связи нет — работаем по снимку. Пустая касса в подвале ресторана
  // неотличима от сломанной, а товар в машине лежит настоящий.
  const snapshot = isError ? readPriceSnapshot() : null;
  const products = fresh ?? snapshot?.products ?? [];

  const pickCustomer = (picked: PosCustomer | null, prices: Map<string, ContractPrice>) => {
    setCustomer(picked);
    cart.applyContract(prices);
    if (picked) saveContractSnapshot(picked.id, prices);
  };

  // Покупатель задан снаружи — его договорные цены надо подтянуть самим:
  // через поиск он не проходил, а значит и цены никто не запрашивал.
  // Иначе ресторан с договорной ценой получил бы с выезда прайсовую.
  const presetId = initialCustomer?.id ?? null;
  const { applyContract } = cart;
  useEffect(() => {
    if (presetId === null) return;
    let alive = true;
    void fetchContractPrices(presetId).then((prices) => {
      if (!alive) return;
      if (prices) {
        applyContract(prices);
        saveContractSnapshot(presetId, prices);
        return;
      }
      // Не доехали — берём из снимка. Пустая карта здесь означала бы
      // «продавать по прайсу», то есть тихо отменить договорённость.
      applyContract(readContractSnapshot(presetId));
    });
    return () => {
      alive = false;
    };
  }, [presetId, applyContract]);

  const submit = usePosSubmit({
    cart: cart.cart,
    customer,
    clearCart: () => cart.setCart([]),
    sellerName: sellerName || 'Egasi',
    origin,
    fmt,
    // После чека остатки изменились — сбрасываем ВЕСЬ куст `admin-products`,
    // а не только список кассы: тот же товар открыт на «Товарах» и на складе.
    onDone: () => queryClient.invalidateQueries({ queryKey: ['admin-products'] }),
    onSale,
  });

  return {
    searchQuery, setSearchQuery, products, loading, customer, pickCustomer, fmt, submit,
    /** Момент снимка прайса — не null, когда касса работает без связи. */
    snapshotAt: snapshot?.at ?? null,
    ...cart,
  };
}
