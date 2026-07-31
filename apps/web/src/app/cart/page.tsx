'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  AlertTriangle, ArrowLeft, ArrowRight, Banknote, CheckCircle, ClipboardList, Clock, CreditCard, FileText, Folder, Home, Lightbulb, MapPin, Minus, Package, PartyPopper, Phone, Plus, ShoppingCart, Smartphone, Sparkles, Trash, Truck, User, XCircle,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { LottieAnimation } from '@/components/ui/LottieAnimation';
import emptyStateData from '@/assets/lottie/empty-state.json';

const spring = { type: 'spring' as const, damping: 25, stiffness: 120 };
import { useCart } from '@/components/providers/CartProvider';
import { useLang } from '@/components/providers/LangProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { useCity } from '@/components/providers/CityProvider';
import dynamic from 'next/dynamic';
import { DELIVERY, freeDeliveryRemaining } from '@/lib/site';
import { type CartProduct } from '@/components/providers/CartProvider';
import { trackBeginCheckout, trackPurchase } from '@/lib/analytics';

const SmartSubscriptionWidget = dynamic(() => import('@/components/shop/SmartSubscriptionWidget').then(m => m.SmartSubscriptionWidget), { ssr: false });

type Step = 'cart' | 'checkout' | 'success';

const PAYMENT_METHODS = [
  { id: 'cash', labelUz: 'Naqd pul', labelRu: 'Наличные', icon: <Banknote size={18} />, descUz: "Yetkazib berishda to'lang", descRu: "Оплата при доставке" },
  { id: 'click', labelUz: 'Click', labelRu: 'Click', icon: <Smartphone size={18} />, descUz: "Click ilovasi orqali", descRu: "Через приложение Click" },
  { id: 'payme', labelUz: 'Payme', labelRu: 'Payme', icon: <CreditCard size={18} />, descUz: "Payme ilovasi orqali", descRu: "Через приложение Payme" },
];

interface RecoProduct {
  id: string;
  nameUz: string;
  nameRu: string;
  slug: string;
  price: number;
  oldPrice?: number | null;
  images: string[];
  category?: { nameUz: string; slug: string };
}

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
      <div className="container" style={{ paddingTop: 'var(--space-6)', paddingBottom: 'var(--space-8)' }}>
        <h1 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ShoppingCart size={28} /> {t('Savat', 'Корзина')}
        </h1>

        {cart.items.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={spring}
            style={{ textAlign: 'center', padding: 'var(--space-12) var(--space-4)', color: 'var(--text-muted)' }}
          >
            <LottieAnimation
              animationData={emptyStateData}
              loop
              style={{ width: 180, height: 180, margin: '0 auto var(--space-4)' }}
            />
            <h3 style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
              {t("Savat bo'sh", "Корзина пуста")}
            </h3>
            <p style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-6)' }}>
              {t("Katalogdan mahsulotlarni qo'shing", "Добавьте товары из каталога")}
            </p>
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
              <Link href="/catalog" className="btn btn-primary btn-lg" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <Folder size={20} /> {t("Katalogga o'tish", "Перейти в каталог")}
              </Link>
            </motion.div>
          </motion.div>
        ) : (
          <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-6)', alignItems: 'start' }}>
            {/* Cart Items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {cart.items.map((item, idx) => (
                <motion.div
                  key={item.product.id}
                  className="card hover-lift"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring, delay: Math.min(idx * 0.06, 0.3) }}
                  style={{
                  padding: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap',
                }}>
                  <div style={{
                    width: 72, height: 72, borderRadius: 'var(--radius-lg)',
                    background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', flexShrink: 0, color: 'var(--text-muted)',
                  }}>
                    {item.product.images && item.product.images.length > 0
                      ? <Image src={item.product.images[0]} alt={item.product.nameUz} width={72} height={72} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius-lg)' }} quality={70} unoptimized={item.product.images[0].startsWith('/uploads/') || item.product.images[0].startsWith('/products/')} />
                      : <Package size={32} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-1)', fontSize: 'var(--text-sm)' }}>
                      {t(item.product.nameUz, item.product.nameRu)}
                    </div>
                    <div style={{ color: 'var(--brand-primary)', fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)' }}>
                      {fmt(item.product.price)} {t("so'm", "сум")}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => cart.updateQuantity(item.product.id, item.quantity - 1)}
                      style={{ width: 36, height: 36, borderRadius: 'var(--radius-full)', border: '1px solid var(--border)' }}>
                      <Minus size={16} />
                    </button>
                    <span style={{ fontWeight: 'var(--font-bold)', width: 28, textAlign: 'center' }}>{item.quantity}</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => cart.updateQuantity(item.product.id, item.quantity + 1)}
                      style={{ width: 36, height: 36, borderRadius: 'var(--radius-full)', border: '1px solid var(--border)' }}>
                      <Plus size={16} />
                    </button>
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', textAlign: 'right' }}>
                    {fmt(item.product.price * item.quantity)} {t("so'm", "сум")}
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => cart.removeItem(item.product.id)}
                    style={{ color: 'var(--error)' }}>
                    <Trash size={18} />
                  </button>
                </motion.div>
              ))}
            </div>

            {/* Order Summary Section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <SmartSubscriptionWidget />
              <div className="card" style={{ padding: 'var(--space-6)', position: 'sticky', top: 'calc(var(--header-height) + var(--space-4))' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-lg)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ClipboardList size={20} /> {t("Buyurtma", "Заказ")}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                  <span>{t("Mahsulotlar", "Товары")} ({cart.totalItems} {t("dona", "шт")})</span>
                  <span>{fmt(cart.subtotal)} {t("so'm", "сум")}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                  <span>{t("Yetkazish", "Доставка")}</span>
                  <span style={{ color: cart.deliveryFee === 0 ? 'var(--success)' : undefined, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {cart.deliveryFee === 0 ? <><PartyPopper size={14} /> {t("Bepul!", "Бесплатно!")}</> : `${fmt(cart.deliveryFee)} ${t("so'm", "сум")}`}
                  </span>
                </div>
                {cart.deliveryFee > 0 && (
                  <div style={{ padding: 'var(--space-3)', background: 'var(--info-bg)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--info)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'var(--font-medium)' }}>
                      <Lightbulb size={14} /> {t(`Yana ${fmt(freeDeliveryRemaining(cart.subtotal))} so'm — bepul yetkazish!`, `Еще ${fmt(freeDeliveryRemaining(cart.subtotal))} сум — бесплатная доставка!`)}
                    </div>
                    <div style={{ height: 5, borderRadius: 999, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 999,
                        width: `${Math.min(100, (cart.subtotal / DELIVERY.freeThreshold) * 100)}%`,
                        background: 'linear-gradient(90deg, var(--brand-primary), var(--brand-accent))',
                        transition: 'width 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                      }} />
                    </div>
                  </div>
                )}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-lg)' }}>{t("Jami", "Итого")}</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)', fontSize: 'var(--text-xl)', color: 'var(--brand-primary)' }}>
                    {fmt(cart.total)} {t("so'm", "сум")}
                  </span>
                </div>
              </div>
              <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 'var(--space-6)', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}
                onClick={() => {
                  trackBeginCheckout(cart.total, cart.items.map(i => ({ id: i.product.id, name: i.product.nameRu || i.product.nameUz, price: i.product.price, quantity: i.quantity })));
                  setStep('checkout');
                }} id="go-checkout-btn">
                {t("Buyurtma berish", "Оформить заказ")} <ArrowRight size={18} />
              </button>
              <div style={{ textAlign: 'center', marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <CreditCard size={14} /> Click · Payme · {t("Naqd pul", "Наличные")}
              </div>
            </div>
          </div>
          </div>

          {/* "Yana qo'shing" recommendations — BELOW summary (better CTA flow) */}
          {(recosLoading || recos.filter((p) => !cart.items.find((i) => i.product.id === p.id)).length > 0) && (
            <div className="card" style={{ padding: 'var(--space-4)' }}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', color: 'var(--text-muted)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={14} style={{ color: 'var(--brand-accent)' }} />
                {t("Yana qo'shing", "Добавьте ещё")}
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-3)', overflowX: 'auto', paddingBottom: 'var(--space-1)' }}>
                {recosLoading
                  ? [1, 2, 3, 4].map((i) => (
                      <div key={i} className="card" style={{ flexShrink: 0, width: 130, padding: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                        <div className="skeleton" style={{ width: '100%', height: 76, borderRadius: 'var(--radius-sm)' }} />
                        <div className="skeleton" style={{ height: 11, width: '80%' }} />
                        <div className="skeleton" style={{ height: 11, width: '50%' }} />
                        <div className="skeleton" style={{ height: 28, width: '100%', borderRadius: 'var(--radius-sm)' }} />
                      </div>
                    ))
                  : recos.filter((p) => !cart.items.find((i) => i.product.id === p.id)).map((p) => {
                      const fmt2 = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');
                      return (
                        <div key={p.id} style={{ flexShrink: 0, width: 130, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 'var(--space-2)', border: '1px solid var(--border)' }}>
                          <div style={{ width: '100%', height: 76, borderRadius: 'var(--radius-sm)', overflow: 'hidden', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {p.images && p.images.length > 0
                              ? <Image src={p.images[0]} alt={p.nameUz} width={130} height={76} style={{ width: '100%', height: '100%', objectFit: 'cover' }} quality={60} unoptimized={!p.images[0].startsWith('https://') && !p.images[0].startsWith('http://')} />
                              : <Package size={24} style={{ color: 'var(--text-muted)' }} />}
                          </div>
                          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--text-primary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.3 }}>
                            {t(p.nameUz, p.nameRu)}
                          </div>
                          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)', color: 'var(--brand-primary)' }}>
                            {fmt2(p.price)} {t("so'm", "сум")}
                          </div>
                          <button
                            className="btn btn-sm"
                            onClick={() => cart.addItem({ id: p.id, nameUz: p.nameUz, nameRu: p.nameRu, price: p.price, oldPrice: p.oldPrice, slug: p.slug, images: p.images, category: p.category } as CartProduct)}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', border: 'none', color: 'var(--text-inverse)', background: 'var(--brand-primary)', fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-xs)' }}
                            id={`reco-add2-${p.id}`}
                          >
                            <Plus size={12} /> {t("Qo'shish", "Добавить")}
                          </button>
                        </div>
                      );
                    })}
              </div>
            </div>
          )}
          </>
        )}
      </div>
    );
  }

  // === CHECKOUT FORM ===
  if (step === 'checkout') {
    return (
      <div className="container" style={{ paddingTop: 'var(--space-6)', paddingBottom: 'var(--space-8)', maxWidth: 600 }}>
        <button onClick={() => setStep('cart')} className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ArrowLeft size={16} /> {t("Savatga qaytish", "Вернуться в корзину")}
        </button>

        <h1 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <FileText size={28} /> {t("Buyurtma rasmiylashtirish", "Оформление заказа")}
        </h1>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {apiError && (
            <div id="order-error" role="alert" style={{ padding: 'var(--space-4)', background: 'var(--error-bg)', color: 'var(--error)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', border: '1px solid rgba(var(--error-rgb), 0.2)' }}>
              <AlertTriangle size={20} />
              {apiError}
            </div>
          )}
          {/* Personal Info */}
          <div className="card" style={{ padding: 'var(--space-6)' }}>
            <h3 style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={18} /> {t("Shaxsiy ma'lumotlar", "Личные данные")}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', marginBottom: 'var(--space-1)', color: 'var(--text-primary)' }}>{t("Ism *", "Имя *")}</label>
                <input type="text" placeholder={t("Ismingizni kiriting", "Введите ваше имя")} value={form.firstName} onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))}
                  style={{ width: '100%', padding: 'var(--space-3)', border: `1px solid ${errors.firstName ? 'var(--error)' : 'var(--border)'}`, borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', outline: 'none', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}
                  id="checkout-name" />
                {errors.firstName && <span style={{ color: 'var(--error)', fontSize: 'var(--text-xs)', marginTop: 4 }}>{errors.firstName}</span>}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', marginBottom: 'var(--space-1)', color: 'var(--text-primary)' }}>{t("Telefon *", "Телефон *")}</label>
                <input type="tel" placeholder="+998 99 123 45 67" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                  style={{ width: '100%', padding: 'var(--space-3)', border: `1px solid ${errors.phone ? 'var(--error)' : 'var(--border)'}`, borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', outline: 'none', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}
                  id="checkout-phone" />
                {errors.phone && <span style={{ color: 'var(--error)', fontSize: 'var(--text-xs)', marginTop: 4 }}>{errors.phone}</span>}
              </div>
            </div>
          </div>

          {/* Address */}
          <div className="card" style={{ padding: 'var(--space-6)' }}>
            <h3 style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MapPin size={18} /> {t("Yetkazish manzili", "Адрес доставки")}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', marginBottom: 'var(--space-1)', color: 'var(--text-primary)' }}>{t("Manzil *", "Адрес *")}</label>
                <textarea placeholder={t("Ko'cha, uy raqami, kvartira...", "Улица, номер дома, квартира...")} value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} rows={2}
                  style={{ width: '100%', padding: 'var(--space-3)', border: `1px solid ${errors.address ? 'var(--error)' : 'var(--border)'}`, borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', outline: 'none', color: 'var(--text-primary)', fontSize: 'var(--text-sm)', resize: 'vertical', fontFamily: 'var(--font-body)' }}
                  id="checkout-address" />
                {errors.address && <span style={{ color: 'var(--error)', fontSize: 'var(--text-xs)', marginTop: 4 }}>{errors.address}</span>}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', marginBottom: 'var(--space-1)', color: 'var(--text-secondary)' }}>{t("Izoh (ixtiyoriy)", "Комментарий (необязательно)")}</label>
                <input type="text" placeholder={t("Masalan: 2-qavatga olib chiqing", "Например: поднимите на 2 этаж")} value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))}
                  style={{ width: '100%', padding: 'var(--space-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', outline: 'none', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}
                  id="checkout-note" />
              </div>
            </div>
          </div>

          {/* Payment */}
          <div className="card" style={{ padding: 'var(--space-6)' }}>
            <h3 style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CreditCard size={18} /> {t("To'lov usuli", "Способ оплаты")}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {PAYMENT_METHODS.map(pm => (
                <label key={pm.id} style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                  padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
                  border: `2px solid ${form.paymentMethod === pm.id ? 'var(--brand-primary)' : 'var(--border)'}`,
                  background: form.paymentMethod === pm.id ? 'var(--brand-primary-light)' : 'transparent',
                  cursor: 'pointer', transition: 'all var(--transition-fast)',
                }}>
                  <input type="radio" name="payment" value={pm.id}
                    checked={form.paymentMethod === pm.id}
                    onChange={() => setForm(p => ({ ...p, paymentMethod: pm.id }))}
                    style={{ accentColor: 'var(--brand-primary)' }} />
                  <span style={{ color: 'var(--brand-primary)' }}>{pm.icon}</span>
                  <div>
                    <div style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-sm)' }}>{t(pm.labelUz, pm.labelRu)}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{t(pm.descUz, pm.descRu)}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="card" style={{ padding: 'var(--space-6)', background: 'var(--brand-primary-light)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
              <span>{cart.totalItems} {t("ta mahsulot", "товаров")}</span>
              <span>{fmt(cart.subtotal)} {t("so'm", "сум")}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>
              <span>{t("Yetkazish", "Доставка")}</span>
              <span style={{ color: cart.deliveryFee === 0 ? 'var(--success)' : undefined, display: 'flex', alignItems: 'center', gap: '4px' }}>
                {cart.deliveryFee === 0 ? <><PartyPopper size={14} /> {t("Bepul!", "Бесплатно!")}</> : `${fmt(cart.deliveryFee)} ${t("so'm", "сум")}`}
              </span>
            </div>
            {/* Promo code */}
            <div style={{ marginBottom: 'var(--space-3)' }}>
              {promo ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 'var(--text-sm)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--success)', fontWeight: 'var(--font-semibold)' }}>
                    <CheckCircle size={16} /> {promo.code} · −{fmt(promoApplied)} {t("so'm", 'сум')}
                  </span>
                  <button onClick={() => { setPromo(null); setPromoInput(''); }} className="btn btn-ghost btn-sm" style={{ color: 'var(--error)', padding: '4px 8px' }} aria-label={t("O'chirish", 'Убрать')}>
                    <XCircle size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text" value={promoInput}
                      onChange={e => { setPromoInput(e.target.value.toUpperCase()); setPromoState('idle'); }}
                      onKeyDown={e => { if (e.key === 'Enter') applyPromo(); }}
                      placeholder={t('Promokod', 'Промокод')}
                      id="promo-input"
                      style={{ flex: 1, minWidth: 0, padding: 'var(--space-2) var(--space-3)', border: `1px solid ${promoState === 'error' ? 'var(--error)' : 'var(--border)'}`, borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)', outline: 'none', textTransform: 'uppercase' }}
                    />
                    <button onClick={applyPromo} disabled={promoState === 'checking' || !promoInput.trim()} className="btn btn-outline btn-sm" id="promo-apply-btn"
                      style={{ opacity: promoState === 'checking' || !promoInput.trim() ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                      {promoState === 'checking' ? t('...', '...') : t("Qo'llash", 'Применить')}
                    </button>
                  </div>
                  {promoState === 'error' && promoError && (
                    <div style={{ marginTop: 6, fontSize: 'var(--text-xs)', color: 'var(--error)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <AlertTriangle size={12} /> {promoError}
                    </div>
                  )}
                </>
              )}
            </div>
            {bonusBalance > 0 && (
              <label htmlFor="use-bonus" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: 'var(--space-3)', fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'var(--font-medium)' }}>
                  <Sparkles size={16} /> {t(`${fmt(bonusBalance)} ball ishlatish`, `Списать ${fmt(bonusBalance)} баллов`)}
                </span>
                <input id="use-bonus" type="checkbox" checked={useBonus} onChange={e => setUseBonus(e.target.checked)}
                  style={{ accentColor: 'var(--brand-primary)', width: 18, height: 18 }} />
              </label>
            )}
            {bonusApplied > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--success)' }}>
                <span>{t("Bonus chegirma", "Скидка бонусами")}</span>
                <span>−{fmt(bonusApplied)} {t("so'm", "сум")}</span>
              </div>
            )}
            {promoApplied > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--success)' }}>
                <span>{t("Promokod", "Промокод")} {promo?.code}</span>
                <span>−{fmt(promoApplied)} {t("so'm", "сум")}</span>
              </div>
            )}
            <div style={{ borderTop: '2px solid var(--brand-primary)', paddingTop: 'var(--space-3)', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-lg)' }}>{t("Jami:", "Итого:")}</span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)', fontSize: 'var(--text-xl)', color: 'var(--brand-primary)' }}>
                {fmt(grandTotal)} {t("so'm", "сум")}
              </span>
            </div>
          </div>

          <button className="btn btn-primary btn-lg btn-block" onClick={handleSubmitOrder} disabled={isSubmitting} id="submit-order-btn"
            style={{ padding: 'var(--space-5)', fontSize: 'var(--text-lg)', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', opacity: isSubmitting ? 0.6 : 1 }}>
            {isSubmitting ? <><Clock size={20} /> {t('Yuborilmoqda...', 'Отправка...')}</> : <><CheckCircle size={20} /> {t('Buyurtmani tasdiqlash', 'Подтвердить заказ')}</>}
          </button>

          {/* Reassurance — no prepayment friction, operator confirms */}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 'var(--space-3)', marginTop: 'calc(-1 * var(--space-3))', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle size={13} style={{ color: 'var(--success)' }} /> {t("Oldindan to'lovsiz", 'Без предоплаты')}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Phone size={13} style={{ color: 'var(--brand-primary)' }} /> {t('Operator tasdiqlaydi', 'Оператор подтвердит')}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Truck size={13} style={{ color: 'var(--brand-accent)' }} /> {t('Bugun yetkazish', 'Доставка сегодня')}</span>
          </div>
        </div>
      </div>
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
