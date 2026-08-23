'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';


import { useCart } from '@/components/providers/CartProvider';
import { useLang } from '@/components/providers/LangProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { useCity } from '@/components/providers/CityProvider';
import { trackPurchase } from '@/lib/analytics';

type Step = 'cart' | 'checkout' | 'success';

import { CartView, type RecoProduct } from './CartView';
import { CheckoutForm } from './CheckoutForm';
import { usePromoCode } from './usePromoCode';
import { CartOrderSuccess } from './CartOrderSuccess';



export default function CartPage() {
  const { t } = useLang();
  const cart = useCart();
  const { city } = useCity();
  // Шаг живёт в адресе, а не только в состоянии.
  //
  // Пока это было `useState`, «Назад» в браузере (на телефоне — смахивание,
  // самый частый жест) уводил не на шаг назад, а со страницы целиком, теряя
  // заполненную форму. А экран успеха нельзя было обновить: F5 показывал
  // пустую корзину вместо номера заказа.
  const router = useRouter();
  const searchParams = useSearchParams();
  const stepParam = searchParams.get('step');
  const step: Step =
    stepParam === 'checkout' || stepParam === 'success' ? stepParam : 'cart';

  const setStep = useCallback(
    (next: Step) => {
      // `replace` для успеха, `push` для остальных: с экрана успеха «назад»
      // должен уводить из оформления, а не возвращать в форму уже
      // оплаченного заказа.
      const url = next === 'cart' ? '/cart' : `/cart?step=${next}`;
      if (next === 'success') router.replace(url);
      else router.push(url);
    },
    [router],
  );
  const [orderNumber, setOrderNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { dbUser } = useAuth();
  const [useBonus, setUseBonus] = useState(false);
  // Порог списания баллов — из настроек, как у сервера.
  const [minCashout, setMinCashout] = useState<number | null>(null);

  // Виджета подписки «Зелёная Коробка» здесь больше нет. Он обещал
  // автодоставку, но `subscriptionInterval`/`subscriptionDeliveryDay` Zod
  // молча выбрасывал (в `orderSchema` их нет), флаг `isSubscription` не читал
  // никто, `GreenBoxSubscription` не создавалась, а исполнять подписку было
  // нечем: крона, который выбирает `status=ACTIVE AND nextDelivery <= today`,
  // нет ни в одном модуле. Клиент выбирал «каждую неделю, вторник», получал
  // экран успеха — и второй доставки не было никогда, а отменять было нечего.

  // Recommendations strip. The fetch runs once; excluding what's already in the cart is
  // derived from state instead of done inside the effect, so the effect has no cart
  // dependency to suppress — and an item added to the cart leaves the strip at once.
  const [featured, setFeatured] = useState<RecoProduct[]>([]);
  const [recosLoading, setRecosLoading] = useState(true);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((d) => {
        if (typeof d?.bonus?.minCashout === 'number') setMinCashout(d.bonus.minCashout);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/products?featured=true&limit=8')
      .then((r) => r.json())
      .then((data) => setFeatured(data.items || []))
      .catch(() => setFeatured([]))
      .finally(() => setRecosLoading(false));
  }, []);

  const recos = useMemo(() => {
    const cartIds = new Set(cart.items.map((i) => i.product.id));
    return featured.filter((p) => !cartIds.has(p.id)).slice(0, 4);
  }, [featured, cart.items]);

  // Checkout form
  const [form, setForm] = useState({
    firstName: '',
    phone: '+998',
    address: '',
    note: '',
    paymentMethod: 'cash',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState('');

  const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

  const {
    promoInput, setPromoInput, promo, setPromo,
    promoState, setPromoState, promoError, applyPromo,
  } = usePromoCode(cart.subtotal, t);

  // Bonus points (only for logged-in accounts). Capped by the goods subtotal.
  const bonusBalance = dbUser?.bonusPoints || 0;
  // Порог тот же, что проверяет сервер (`bonus.minCashout`): пока настройка
  // не загрузилась, считаем как раньше — но галочку показываем только при
  // соблюдённом пороге, см. CheckoutSummary.
  const bonusEligible = minCashout === null || bonusBalance >= minCashout;
  const bonusApplied = useBonus && bonusEligible ? Math.min(bonusBalance, cart.subtotal) : 0;
  // Promo is capped by what's left of the goods subtotal after bonus.
  const promoApplied = promo ? Math.min(promo.discount, cart.subtotal - bonusApplied) : 0;
  const grandTotal = cart.total - bonusApplied - promoApplied;

  const validateForm = (): boolean => {
    setApiError('');
    const newErrors: Record<string, string> = {};
    if (!form.firstName.trim()) newErrors.firstName = t("Ism kiritilmadi", "Имя не введено");
    if (form.phone.length < 13) newErrors.phone = t("Telefon raqam noto'g'ri", "Неверный номер телефона");
    if (!form.address.trim()) newErrors.address = t("Manzil kiritilmadi", "Адрес не введен");
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmitOrder = async () => {
    if (!validateForm()) return;
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: { firstName: form.firstName, phone: form.phone, address: form.address, note: form.note },
          city,
          // Цену не шлём: её ставит сервер по каталогу. Присланная всё равно
          // игнорируется — иначе покупатель назначал бы её себе сам.
          items: cart.items.map(i => ({ productId: i.product.id, quantity: i.quantity })),
          paymentMethod: form.paymentMethod,
          // userId не передаём: владельца заказа сервер берёт из cookie
          // сессии. Присланный телом он всё равно игнорируется — иначе
          // чужими баллами можно было оплатить свою покупку.
          bonusToUse: bonusApplied,
          promoCode: promo?.code,
        }),
      });

      const data = await res.json();
      if (data.success) {
        trackPurchase(
          data.order.orderNumber,
          data.order.total ?? grandTotal,
          cart.items.map(i => ({ id: i.product.id, name: i.product.nameRu || i.product.nameUz, price: i.product.price, quantity: i.quantity })),
        );
        setOrderNumber(data.order.orderNumber);
        cart.clearCart();
        setStep('success');
      } else {
        setApiError(data.error || t("Xatolik yuz berdi", "Произошла ошибка"));
      }
    } catch {
      setApiError(t("Ulanishda xatolik yuz berdi. Iltimos, qayta urinib ko'ring.", "Ошибка соединения. Пожалуйста, попробуйте еще раз."));
    } finally {
      setIsSubmitting(false);
    }
  };

  // === CART VIEW ===
  if (step === 'cart') {
    return (
      <CartView
        cart={cart}
        recos={recos}
        recosLoading={recosLoading}
        fmt={fmt}
        setStep={setStep}
      />
    );
  }

  // === CHECKOUT FORM ===
  if (step === 'checkout') {
    return (
      <CheckoutForm
        cart={cart}
        form={form}
        setForm={setForm}
        errors={errors}
        apiError={apiError}
        isSubmitting={isSubmitting}
        grandTotal={grandTotal}
        bonusBalance={bonusBalance}
        bonusApplied={bonusApplied}
        minCashout={minCashout}
        useBonus={useBonus}
        setUseBonus={setUseBonus}
        promo={promo}
        setPromo={setPromo}
        promoInput={promoInput}
        setPromoInput={setPromoInput}
        promoState={promoState}
        setPromoState={setPromoState}
        promoApplied={promoApplied}
        promoError={promoError}
        applyPromo={applyPromo}
        handleSubmitOrder={handleSubmitOrder}
        fmt={fmt}
        setStep={setStep}
      />
    );
  }

  // === ORDER SUCCESS ===
  return <CartOrderSuccess orderNumber={orderNumber} form={form} t={t} />;
}
