'use client';

import { useRef, useState } from 'react';
import { cartTotal } from '@/lib/qty';
import { newClientKey } from '@/lib/pos/saleQueue';
import { belowCostWarnings, missingPriceReasons, submitReturn, submitSale } from './posApi';
import { useFeedback } from './AdminFeedback';
import { useSaleQueue } from './useSaleQueue';
import type { CartDiscount, CartItem, DebtInfo, PosCustomer, SaleDate } from './AdminPOSTypes';

// Оформление продажи и возврата. Вынесено из AdminPOS: файл перерос 200
// строк, когда к чеку добавились уступка, деловая дата и автор.
//
// Все проверки здесь — предварительные, и сервер повторяет каждую у себя:
// браузеру верить нельзя, а показывать отказ ПОСЛЕ нажатия «Продать» —
// значит держать покупателя у кассы лишнюю минуту.
//
// ЧЕК НЕ ТЕРЯЕТСЯ БЕЗ СВЯЗИ. Продажа с выезда делается там, где сети нет:
// во дворе ресторана, в подвале, за городом. Раньше обрыв означал отказ на
// продажу, которая физически состоялась — товар отдан, деньги взяты. Теперь
// чек уходит в очередь (lib/pos/saleQueue) и досылается сам.
//
// Ключ идемпотентности при этом обязателен: отправленный дважды чек — это
// второй раз списанный товар и вторая выручка.

export interface SaleResultState {
  saleNumber: string;
  total: number;
  isReturn?: boolean;
  items?: CartItem[];
  payMethod?: string;
  date?: string;
  /** Связи не было: чек принят в очередь и уйдёт сам. Номера ещё нет. */
  queued?: boolean;
}

interface Options {
  cart: CartItem[];
  /** Покупатель чека: договорная цена, история продаж и связь с CRM. */
  customer: PosCustomer | null;
  clearCart: () => void;
  sellerName: string;
  /** Где продают: за прилавком или с выезда по карте. */
  origin: 'counter' | 'field';
  fmt: (n: number) => string;
  onDone: () => void;
  /** Чек прошёл или принят в очередь — знает тот, кто открыл кассу. */
  onSale?: (result: SaleResultState) => void;
}

export function usePosSubmit({
  cart, customer, clearCart, sellerName, origin, fmt, onDone, onSale,
}: Options) {
  const [processing, setProcessing] = useState(false);
  const [saleResult, setSaleResult] = useState<SaleResultState | null>(null);
  const queue = useSaleQueue();
  // Тост и подтверждение вместо нативных окон: касса живёт на телефоне, а
  // `alert()` в Telegram Mini App выезжает системным листом поверх экрана —
  // прямо посреди чека, с покупателем у прилавка.
  const notify = useFeedback();

  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'debt'>('cash');
  const [debtInfo, setDebtInfo] = useState<DebtInfo>({ personName: '', phone: '', dueDate: '' });
  const [discount, setDiscount] = useState<CartDiscount | null>(null);
  const [saleDate, setSaleDate] = useState<SaleDate | null>(null);
  const [seller, setSeller] = useState('');

  const [returnReason, setReturnReason] = useState('');
  // Номер чека, из которого возвращают. Без него сервер отклонит возврат:
  // по нему проверяется, что возвращают не больше проданного и не повторно.
  const [returnSaleNumber, setReturnSaleNumber] = useState('');

  // Ключ живёт до конца попытки: он один и тот же для запроса и для записи
  // в очереди, иначе досылка перестала бы быть идемпотентной.
  const clientKey = useRef<string>(newClientKey());

  /** Что мешает провести чек. Пустая строка — можно. */
  const blocker = (): string => {
    const unexplained = missingPriceReasons(cart);
    if (unexplained.length > 0) return `Narx o'zgartirilgan, sabab kerak: ${unexplained.join(', ')}`;
    if (saleDate && !saleDate.date) return 'Sotuv sanasi tanlanmagan';
    if (saleDate && !saleDate.reason.trim()) return 'Orqaga sana uchun sabab kerak';
    if (discount && Number(discount.value) > 0 && !discount.reason.trim()) return 'Chegirma uchun sabab kerak';
    return '';
  };

  const finish = (result: SaleResultState) => {
    setSaleResult(result);
    clearCart();
    setPaymentMethod('cash');
    setDebtInfo({ personName: '', phone: '', dueDate: '' });
    setDiscount(null);
    setSaleDate(null);
    setSeller('');
    clientKey.current = newClientKey();
    onDone();
    onSale?.(result);
  };

  /** Чек в очередь: связи нет, а продажа состоялась. */
  const remember = (total: number) => {
    queue.remember({
      key: clientKey.current,
      soldAt: Date.now(),
      label: `${customer?.name ?? 'Покупатель'} · ${fmt(total)}`,
      body: {
        items: cart.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          price: item.customPrice,
          priceReason: item.customPrice === item.product.price ? undefined : item.priceReason,
        })),
        paymentMethod,
        customerId: customer?.id ?? null,
        performedBy: seller.trim() || sellerName,
        origin,
        clientKey: clientKey.current,
        debtInfo: paymentMethod === 'debt' ? debtInfo : undefined,
        discount: discount && Number(discount.value) > 0
          ? { type: discount.type, value: Number(discount.value), reason: discount.reason }
          : undefined,
      },
    });
  };

  const processSale = async () => {
    if (cart.length === 0) return;
    if (paymentMethod === 'debt' && !debtInfo.personName) return;

    const problem = blocker();
    if (problem) {
      notify.toast(problem, 'warning');
      return;
    }

    const warnings = belowCostWarnings(cart, fmt);
    if (warnings.length > 0) {
      const agreed = await notify.confirm({
        title: 'Tan narxidan past sotilmoqda',
        detail: `${warnings.join('\n')}\n\nDavom etasizmi?`,
        confirmText: 'Sotish',
        danger: true,
      });
      if (!agreed) return;
    }

    // Сумма — тем же помощником, что и на сервере: позиции округляются по
    // одной. Своя арифметика здесь дала бы в очереди сумму, отличную от той,
    // что пробьётся при досылке.
    const total = cartTotal(cart.map((i) => ({ price: i.customPrice, quantity: i.quantity })));

    setProcessing(true);
    try {
      const data = await submitSale(cart, paymentMethod, sellerName, debtInfo, {
        discount, saleDate, seller, customerId: customer?.id ?? null,
        origin, clientKey: clientKey.current,
      });
      if (!data.success) {
        // Отказ сервера — это не «нет связи»: чек негоден, и повторять его
        // в очереди бессмысленно. Человек должен узнать сейчас.
        notify.error(data.error || 'Chek o‘tmadi');
        return;
      }
      finish({
        saleNumber: data.saleNumber!,
        total: data.total!,
        items: cart,
        payMethod: paymentMethod,
        // Дата в чеке — деловая: продажа за вчера и печатается вчерашней.
        date: new Date(data.soldAt ?? Date.now()).toLocaleString('ru-RU'),
      });
      // Заодно уходит всё, что накопилось, пока связи не было.
      void queue.flush();
    } catch (err) {
      // Сюда попадает только сетевой отказ: разобранный ответ сервера идёт
      // веткой выше. Значит, продажа состоялась, а связи нет — в очередь.
      console.error('Sale error:', err);
      remember(total);
      finish({ saleNumber: '', total, items: cart, payMethod: paymentMethod, queued: true });
    } finally {
      setProcessing(false);
    }
  };

  const processReturn = async () => {
    if (cart.length === 0) return;

    setProcessing(true);
    try {
      const data = await submitReturn(cart, returnReason, sellerName, returnSaleNumber.trim());
      if (!data.success) {
        notify.error(data.error || 'Qaytarish o‘tmadi');
        return;
      }
      setSaleResult({
        saleNumber: data.returnNumber!,
        total: data.totalRefund!,
        isReturn: true,
        items: cart,
        date: new Date().toLocaleString('ru-RU'),
      });
      clearCart();
      setReturnReason('');
      setReturnSaleNumber('');
      onDone();
    } catch (err) {
      // Возврат в очередь НЕ кладём: он сверяется с исходным чеком на
      // сервере («не больше проданного, не повторно»), и отложенная досылка
      // прошла бы эту сверку по устаревшим данным.
      console.error('Return error:', err);
      notify.error('Aloqa yo‘q — qaytarishni keyinroq kiriting');
    } finally {
      setProcessing(false);
    }
  };

  return {
    processing, saleResult, setSaleResult,
    paymentMethod, setPaymentMethod, debtInfo, setDebtInfo,
    discount, setDiscount, saleDate, setSaleDate, seller, setSeller,
    returnReason, setReturnReason, returnSaleNumber, setReturnSaleNumber,
    processSale, processReturn,
    /** Очередь отложенных чеков — её показывает касса. */
    queue,
  };
}
