'use client';

import { useState } from 'react';
import { belowCostWarnings, missingPriceReasons, submitReturn, submitSale } from './posApi';
import type { CartDiscount, CartItem, DebtInfo, SaleDate } from './AdminPOSTypes';

// Оформление продажи и возврата. Вынесено из AdminPOS: файл перерос 200
// строк, когда к чеку добавились уступка, деловая дата и автор.
//
// Все проверки здесь — предварительные, и сервер повторяет каждую у себя:
// браузеру верить нельзя, а показывать отказ ПОСЛЕ нажатия «Продать» —
// значит держать покупателя у кассы лишнюю минуту.

export interface SaleResultState {
  saleNumber: string;
  total: number;
  isReturn?: boolean;
  items?: CartItem[];
  payMethod?: string;
  date?: string;
}

interface Options {
  cart: CartItem[];
  /** Покупатель чека — его выбирают ради договорной цены. */
  customerId: number | null;
  clearCart: () => void;
  sellerName: string;
  fmt: (n: number) => string;
  onDone: () => void;
}

export function usePosSubmit({ cart, customerId, clearCart, sellerName, fmt, onDone }: Options) {
  const [processing, setProcessing] = useState(false);
  const [saleResult, setSaleResult] = useState<SaleResultState | null>(null);

  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'debt'>('cash');
  const [debtInfo, setDebtInfo] = useState<DebtInfo>({ personName: '', phone: '', dueDate: '' });
  const [discount, setDiscount] = useState<CartDiscount | null>(null);
  const [saleDate, setSaleDate] = useState<SaleDate | null>(null);
  const [seller, setSeller] = useState('');

  const [returnReason, setReturnReason] = useState('');
  // Номер чека, из которого возвращают. Без него сервер отклонит возврат:
  // по нему проверяется, что возвращают не больше проданного и не повторно.
  const [returnSaleNumber, setReturnSaleNumber] = useState('');

  /** Что мешает провести чек. Пустая строка — можно. */
  const blocker = (): string => {
    const unexplained = missingPriceReasons(cart);
    if (unexplained.length > 0) return `Narx o'zgartirilgan, sabab kerak: ${unexplained.join(', ')}`;
    if (saleDate && !saleDate.date) return 'Sotuv sanasi tanlanmagan';
    if (saleDate && !saleDate.reason.trim()) return 'Orqaga sana uchun sabab kerak';
    if (discount && Number(discount.value) > 0 && !discount.reason.trim()) return 'Chegirma uchun sabab kerak';
    return '';
  };

  const processSale = async () => {
    if (cart.length === 0) return;
    if (paymentMethod === 'debt' && !debtInfo.personName) return;

    const problem = blocker();
    if (problem) {
      alert(problem);
      return;
    }

    const warnings = belowCostWarnings(cart, fmt);
    const listed = warnings.join('\n');
    if (warnings.length > 0 && !confirm(`DIQQAT! Tan narxidan past sotilmoqda:\n\n${listed}\n\nDavom etasizmi?`)) return;

    setProcessing(true);
    try {
      const data = await submitSale(cart, paymentMethod, sellerName, debtInfo, {
        discount, saleDate, seller, customerId,
      });
      if (!data.success) {
        alert(data.error || 'Xatolik yuz berdi');
        return;
      }
      setSaleResult({
        saleNumber: data.saleNumber!,
        total: data.total!,
        items: cart,
        payMethod: paymentMethod,
        // Дата в чеке — деловая: продажа за вчера и печатается вчерашней.
        date: new Date(data.soldAt ?? Date.now()).toLocaleString('ru-RU'),
      });
      clearCart();
      setPaymentMethod('cash');
      setDebtInfo({ personName: '', phone: '', dueDate: '' });
      setDiscount(null);
      setSaleDate(null);
      setSeller('');
      onDone();
    } catch (err) {
      console.error('Sale error:', err);
      alert('Xatolik yuz berdi');
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
        alert(data.error || 'Xatolik yuz berdi');
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
      console.error('Return error:', err);
      alert('Xatolik yuz berdi');
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
  };
}
