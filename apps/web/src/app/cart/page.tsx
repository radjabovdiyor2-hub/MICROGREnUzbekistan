'use client';

import { useState, useEffect, useMemo } from 'react';


import { useCart } from '@/components/providers/CartProvider';
import { useLang } from '@/components/providers/LangProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { useCity } from '@/components/providers/CityProvider';
import { trackPurchase } from '@/lib/analytics';

type Step = 'cart' | 'checkout' | 'success';

import { CartView, type RecoProduct } from './CartView';
import { CheckoutForm } from './CheckoutForm';
import { CartOrderSuccess } from './CartOrderSuccess';



export default function CartPage() {
  const { t } = useLang();
  const cart = useCart();
  const { city } = useCity();
  const [step, setStep] = useState<Step>('cart');
  const [orderNumber, setOrderNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { dbUser } = useAuth();
  const [useBonus, setUseBonus] = useState(false);
  const [isSubscription, setIsSubscription] = useState(false);
  const [subscriptionConfig, setSubscriptionConfig] = useState<{ interval: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'; deliveryDay: number }>({ interval: 'WEEKLY', deliveryDay: 1 });

  // Recommendations strip. The fetch runs once; excluding what's already in the cart is
  // derived from state instead of done inside the effect, so the effect has no cart
  // dependency to suppress — and an item added to the cart leaves the strip at once.
  const [featured, setFeatured] = useState<RecoProduct[]>([]);
  const [recosLoading, setRecosLoading] = useState(true);

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

  // Promo code
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState<{ code: string; discount: number } | null>(null);
  const [promoState, setPromoState] = useState<'idle' | 'checking' | 'error'>('idle');
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
        body: JSON.stringify({ code, subtotal: cart.subtotal }),
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

  // Bonus points (only for logged-in accounts). Capped by the goods subtotal.
  const bonusBalance = dbUser?.bonusPoints || 0;
  const bonusApplied = useBonus ? Math.min(bonusBalance, cart.subtotal) : 0;
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
          items: cart.items.map(i => ({ productId: i.product.id, price: i.product.price, quantity: i.quantity })),
          paymentMethod: form.paymentMethod,
          userId: dbUser?.id,
          bonusToUse: bonusApplied,
          promoCode: promo?.code,
          isSubscription,
          subscriptionInterval: isSubscription ? subscriptionConfig.interval : undefined,
          subscriptionDeliveryDay: isSubscription ? subscriptionConfig.deliveryDay : undefined,
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
        isSubscription={isSubscription}
        setIsSubscription={setIsSubscription}
        subscriptionConfig={subscriptionConfig}
        setSubscriptionConfig={setSubscriptionConfig}
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
