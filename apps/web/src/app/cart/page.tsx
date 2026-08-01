'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { CheckCircle, CreditCard, Folder, Home, MapPin, PartyPopper, Phone, User } from 'lucide-react';

const spring = { type: 'spring' as const, damping: 25, stiffness: 120 };
import { useCart } from '@/components/providers/CartProvider';
import { useLang } from '@/components/providers/LangProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { useCity } from '@/components/providers/CityProvider';
import dynamic from 'next/dynamic';
import { type CartProduct } from '@/components/providers/CartProvider';
import { trackPurchase } from '@/lib/analytics';

const SmartSubscriptionWidget = dynamic(() => import('@/components/shop/SmartSubscriptionWidget').then(m => m.SmartSubscriptionWidget), { ssr: false });

type Step = 'cart' | 'checkout' | 'success';

import { CartView, type RecoProduct } from './CartView';
import { CheckoutForm, PAYMENT_METHODS } from './CheckoutForm';



export default function CartPage() {
  const { t } = useLang();
  const cart = useCart();
  const { city } = useCity();
  const [step, setStep] = useState<Step>('cart');
  const [orderNumber, setOrderNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { dbUser } = useAuth();
  const [useBonus, setUseBonus] = useState(false);

  // Recommendations strip
  const [recos, setRecos] = useState<RecoProduct[]>([]);
  const [recosLoading, setRecosLoading] = useState(true);

  useEffect(() => {
    setRecosLoading(true);
    fetch('/api/products?featured=true&limit=8')
      .then((r) => r.json())
      .then((data) => {
        const cartIds = new Set(cart.items.map((i) => i.product.id));
        const filtered = (data.items || []).filter((p: RecoProduct) => !cartIds.has(p.id)).slice(0, 4);
        setRecos(filtered);
      })
      .catch(() => setRecos([]))
      .finally(() => setRecosLoading(false));
  // We intentionally run once on mount; cart changes are reflected via the cartIds filter on re-render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          customer: {
            firstName: form.firstName,
            phone: form.phone,
            address: form.address,
            note: form.note,
          },
          city: city,
          items: cart.items.map(i => ({
            productId: i.product.id,
            price: i.product.price,
            quantity: i.quantity,
          })),
          paymentMethod: form.paymentMethod,
          userId: dbUser?.id,
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
    } catch (err) {
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
  return (
    <div className="bg-mesh" style={{ paddingTop: 'var(--space-12)', paddingBottom: 'var(--space-8)', textAlign: 'center', minHeight: '70vh', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '5%', left: '10%', width: '100px', height: '100px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(var(--brand-primary-rgb), 0.15) 0%, transparent 70%)', animation: 'float-orb 6s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', bottom: '10%', right: '5%', width: '140px', height: '140px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(var(--brand-accent-rgb), 0.1) 0%, transparent 70%)', animation: 'float-orb 8s ease-in-out infinite reverse' }} />
      <div className="container" style={{ maxWidth: 500, position: 'relative', zIndex: 1 }}>
      <div style={{ marginBottom: 'var(--space-4)', color: 'var(--success)', animation: 'scaleIn 0.5s ease' }}>
        <PartyPopper size={80} />
      </div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-extrabold)', marginBottom: 'var(--space-3)' }}>
        {t("Buyurtma qabul qilindi!", "Заказ принят!")}
      </h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-6)' }}>
        {t("Tez orada operator siz bilan bog'lanadi", "Скоро с вами свяжется оператор")}
      </p>

      <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'left', marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
          <span style={{
            padding: 'var(--space-2) var(--space-3)', background: 'var(--success-bg)', color: 'var(--success)',
            borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)',
            display: 'inline-flex', alignItems: 'center', gap: '4px',
          }}>
            <CheckCircle size={14} /> {t("Tasdiqlandi", "Подтверждено")}
          </span>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', color: 'var(--brand-primary)' }}>
            #{orderNumber}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}><User size={14} /> {t("Ism", "Имя")}</span>
            <span style={{ fontWeight: 'var(--font-semibold)' }}>{form.firstName}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}><Phone size={14} /> {t("Telefon", "Телефон")}</span>
            <span style={{ fontWeight: 'var(--font-semibold)' }}>{form.phone}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}><MapPin size={14} /> {t("Manzil", "Адрес")}</span>
            <span style={{ fontWeight: 'var(--font-semibold)' }}>{form.address}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}><CreditCard size={14} /> {t("To'lov", "Оплата")}</span>
            <span style={{ fontWeight: 'var(--font-semibold)' }}>
              {t(PAYMENT_METHODS.find(p => p.id === form.paymentMethod)?.labelUz || '', PAYMENT_METHODS.find(p => p.id === form.paymentMethod)?.labelRu || '')}
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <Link href="/" className="btn btn-primary btn-lg btn-block" style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
          <Home size={20} /> {t("Bosh sahifa", "Главная")}
        </Link>
        <Link href="/catalog" className="btn btn-outline btn-lg btn-block" style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
          <Folder size={20} /> {t("Yana xarid qilish", "Вернуться к покупкам")}
        </Link>
        <a href="tel:+998949999599" className="btn btn-ghost" style={{ fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
          <Phone size={16} /> {t("Aloqa: +998 94 999 95 99", "Связь: +998 94 999 95 99")}
        </a>
      </div>
      </div>
    </div>
  );
}
