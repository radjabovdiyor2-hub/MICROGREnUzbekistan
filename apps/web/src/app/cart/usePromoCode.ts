'use client';

import { useState } from 'react';

// Промокод корзины: ввод, проверка на сервере и результат.
//
// Вынесено из cart/page.tsx отдельным хуком — там осталась сама страница,
// а это законченный кусок состояния со своим запросом. Скидку считает
// СЕРВЕР (/api/promo): клиент не знает ни правил, ни сроков действия кода,
// и вычислять её здесь значило бы держать вторую копию правил.

export type Promo = { code: string; discount: number } | null;
export type PromoState = 'idle' | 'checking' | 'error';

export function usePromoCode(subtotal: number, t: (uz: string, ru: string) => string) {
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState<Promo>(null);
  const [promoState, setPromoState] = useState<PromoState>('idle');
  const [promoError, setPromoError] = useState('');

  const applyPromo = async () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    setPromoState('checking');
    setPromoError('');
    try {
      const res = await fetch('/api/promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, subtotal }),
      });
      const data = await res.json();
      if (data.valid) {
        setPromo({ code, discount: data.discount });
        setPromoState('idle');
      } else {
        setPromo(null);
        setPromoState('error');
        setPromoError(data.error || t("Promokod noto'g'ri", 'Промокод недействителен'));
      }
    } catch {
      setPromoState('error');
      setPromoError(t('Ulanishda xatolik', 'Ошибка соединения'));
    }
  };

  return {
    promoInput, setPromoInput,
    promo, setPromo,
    promoState, setPromoState,
    promoError,
    applyPromo,
  };
}
