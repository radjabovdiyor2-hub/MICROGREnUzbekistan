'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import * as Icons from '@/components/ui/Icons';
import { useCart } from '@/components/providers/CartProvider';
import { useLang } from '@/components/providers/LangProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import dynamic from 'next/dynamic';
import { freeDeliveryRemaining } from '@/lib/site';

const SmartSubscriptionWidget = dynamic(() => import('@/components/shop/SmartSubscriptionWidget').then(m => m.SmartSubscriptionWidget), { ssr: false });

type Step = 'cart' | 'checkout' | 'success';

const PAYMENT_METHODS = [
  { id: 'cash', labelUz: 'Naqd pul', labelRu: 'Наличные', icon: <Icons.Banknote size={18} />, descUz: "Yetkazib berishda to'lang", descRu: "Оплата при доставке" },
  { id: 'click', labelUz: 'Click', labelRu: 'Click', icon: <Icons.Smartphone size={18} />, descUz: "Click ilovasi orqali", descRu: "Через приложение Click" },
  { id: 'payme', labelUz: 'Payme', labelRu: 'Payme', icon: <Icons.CreditCard size={18} />, descUz: "Payme ilovasi orqali", descRu: "Через приложение Payme" },
];

export default function CartPage() {
  const { t } = useLang();
  const cart = useCart();
  const [step, setStep] = useState<Step>('cart');
  const [orderNumber, setOrderNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { dbUser } = useAuth();
  const [useBonus, setUseBonus] = useState(false);

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

  // Bonus points (only for logged-in accounts). Capped by the goods subtotal.
  const bonusBalance = dbUser?.bonusPoints || 0;
  const bonusApplied = useBonus ? Math.min(bonusBalance, cart.subtotal) : 0;
  const grandTotal = cart.total - bonusApplied;

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
          items: cart.items.map(i => ({
            productId: i.product.id,
            price: i.product.price,
            quantity: i.quantity,
          })),
          paymentMethod: form.paymentMethod,
          userId: dbUser?.id,
          bonusToUse: bonusApplied,
        }),
      });

      const data = await res.json();
      if (data.success) {
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
          <Icons.ShoppingCart size={28} /> {t('Savat', 'Корзина')}
        </h1>

        {cart.items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-16)', color: 'var(--text-muted)', animation: 'page-enter 0.5s ease both' }}>
            <div style={{ marginBottom: 'var(--space-4)', animation: 'float-up-down 4s ease-in-out infinite' }}><Icons.ShoppingCart size={80} /></div>
            <h3 style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
              {t("Savat bo'sh", "Корзина пуста")}
            </h3>
            <p style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-6)' }}>
              {t("Katalogdan mahsulotlarni qo'shing", "Добавьте товары из каталога")}
            </p>
            <Link href="/catalog" className="btn btn-primary btn-lg btn-magnetic ripple" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <Icons.Folder size={20} /> {t("Katalogga o'tish", "Перейти в каталог")}
            </Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-6)', alignItems: 'start' }}>
            {/* Cart Items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {cart.items.map((item, idx) => (
                <div key={item.product.id} className="card hover-lift" style={{
                  padding: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap',
                  animation: `page-enter 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${idx * 80}ms both`,
                }}>
                  <div style={{
                    width: 72, height: 72, borderRadius: 'var(--radius-lg)',
                    background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', flexShrink: 0, color: 'var(--text-muted)',
                  }}>
                    {item.product.images && item.product.images.length > 0
                      ? <Image src={item.product.images[0]} alt={item.product.nameUz} width={72} height={72} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius-lg)' }} quality={70} unoptimized={item.product.images[0].startsWith('/uploads/') || item.product.images[0].startsWith('/products/')} />
                      : <Icons.Package size={32} />}
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
                      <Icons.Minus size={16} />
                    </button>
                    <span style={{ fontWeight: 'var(--font-bold)', width: 28, textAlign: 'center' }}>{item.quantity}</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => cart.updateQuantity(item.product.id, item.quantity + 1)}
                      style={{ width: 36, height: 36, borderRadius: 'var(--radius-full)', border: '1px solid var(--border)' }}>
                      <Icons.Plus size={16} />
                    </button>
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', textAlign: 'right' }}>
                    {fmt(item.product.price * item.quantity)} {t("so'm", "сум")}
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => cart.removeItem(item.product.id)}
                    style={{ color: 'var(--error)' }}>
                    <Icons.Trash size={18} />
                  </button>
                </div>
              ))}
            </div>

            {/* Order Summary Section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <SmartSubscriptionWidget />
              <div className="card" style={{ padding: 'var(--space-6)', position: 'sticky', top: 'calc(var(--header-height) + var(--space-4))' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-lg)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icons.ClipboardList size={20} /> {t("Buyurtma", "Заказ")}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                  <span>{t("Mahsulotlar", "Товары")} ({cart.totalItems} {t("dona", "шт")})</span>
                  <span>{fmt(cart.subtotal)} {t("so'm", "сум")}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                  <span>{t("Yetkazish", "Доставка")}</span>
                  <span style={{ color: cart.deliveryFee === 0 ? 'var(--success)' : undefined, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {cart.deliveryFee === 0 ? <><Icons.PartyPopper size={14} /> {t("Bepul!", "Бесплатно!")}</> : `${fmt(cart.deliveryFee)} ${t("so'm", "сум")}`}
                  </span>
                </div>
                {cart.deliveryFee > 0 && (
                  <div style={{ padding: 'var(--space-2) var(--space-3)', background: 'var(--info-bg)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', color: 'var(--info)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Icons.Lightbulb size={14} /> {t(`Yana ${fmt(freeDeliveryRemaining(cart.subtotal))} so'm — bepul yetkazish!`, `Еще ${fmt(freeDeliveryRemaining(cart.subtotal))} сум — бесплатная доставка!`)}
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
                onClick={() => setStep('checkout')} id="go-checkout-btn">
                {t("Buyurtma berish", "Оформить заказ")} <Icons.ArrowRight size={18} />
              </button>
              <div style={{ textAlign: 'center', marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Icons.CreditCard size={14} /> Click · Payme · {t("Naqd pul", "Наличные")}
              </div>
            </div>
          </div>
          </div>
        )}
      </div>
    );
  }

  // === CHECKOUT FORM ===
  if (step === 'checkout') {
    return (
      <div className="container" style={{ paddingTop: 'var(--space-6)', paddingBottom: 'var(--space-8)', maxWidth: 600 }}>
        <button onClick={() => setStep('cart')} className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Icons.ArrowLeft size={16} /> {t("Savatga qaytish", "Вернуться в корзину")}
        </button>

        <h1 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Icons.FileText size={28} /> {t("Buyurtma rasmiylashtirish", "Оформление заказа")}
        </h1>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {apiError && (
            <div style={{ padding: 'var(--space-4)', background: 'var(--error-bg)', color: 'var(--error)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', border: '1px solid rgba(var(--error-rgb), 0.2)' }}>
              <Icons.AlertTriangle size={20} />
              {apiError}
            </div>
          )}
          {/* Personal Info */}
          <div className="card" style={{ padding: 'var(--space-6)' }}>
            <h3 style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icons.User size={18} /> {t("Shaxsiy ma'lumotlar", "Личные данные")}
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
              <Icons.MapPin size={18} /> {t("Yetkazish manzili", "Адрес доставки")}
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
              <Icons.CreditCard size={18} /> {t("To'lov usuli", "Способ оплаты")}
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
                {cart.deliveryFee === 0 ? <><Icons.PartyPopper size={14} /> {t("Bepul!", "Бесплатно!")}</> : `${fmt(cart.deliveryFee)} ${t("so'm", "сум")}`}
              </span>
            </div>
            {bonusBalance > 0 && (
              <label htmlFor="use-bonus" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: 'var(--space-3)', fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'var(--font-medium)' }}>
                  <Icons.Sparkles size={16} /> {t(`${fmt(bonusBalance)} ball ishlatish`, `Списать ${fmt(bonusBalance)} баллов`)}
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
            <div style={{ borderTop: '2px solid var(--brand-primary)', paddingTop: 'var(--space-3)', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-lg)' }}>{t("Jami:", "Итого:")}</span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)', fontSize: 'var(--text-xl)', color: 'var(--brand-primary)' }}>
                {fmt(grandTotal)} {t("so'm", "сум")}
              </span>
            </div>
          </div>

          <button className="btn btn-primary btn-lg btn-block" onClick={handleSubmitOrder} disabled={isSubmitting} id="submit-order-btn"
            style={{ padding: 'var(--space-5)', fontSize: 'var(--text-lg)', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', opacity: isSubmitting ? 0.6 : 1 }}>
            {isSubmitting ? <><Icons.Clock size={20} /> {t('Yuborilmoqda...', 'Отправка...')}</> : <><Icons.CheckCircle size={20} /> {t('Buyurtmani tasdiqlash', 'Подтвердить заказ')}</>}
          </button>
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
        <Icons.PartyPopper size={80} />
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
            <Icons.CheckCircle size={14} /> {t("Tasdiqlandi", "Подтверждено")}
          </span>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', color: 'var(--brand-primary)' }}>
            #{orderNumber}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}><Icons.User size={14} /> {t("Ism", "Имя")}</span>
            <span style={{ fontWeight: 'var(--font-semibold)' }}>{form.firstName}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}><Icons.Phone size={14} /> {t("Telefon", "Телефон")}</span>
            <span style={{ fontWeight: 'var(--font-semibold)' }}>{form.phone}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}><Icons.MapPin size={14} /> {t("Manzil", "Адрес")}</span>
            <span style={{ fontWeight: 'var(--font-semibold)' }}>{form.address}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}><Icons.CreditCard size={14} /> {t("To'lov", "Оплата")}</span>
            <span style={{ fontWeight: 'var(--font-semibold)' }}>
              {t(PAYMENT_METHODS.find(p => p.id === form.paymentMethod)?.labelUz || '', PAYMENT_METHODS.find(p => p.id === form.paymentMethod)?.labelRu || '')}
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <Link href="/" className="btn btn-primary btn-lg btn-block" style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
          <Icons.Home size={20} /> {t("Bosh sahifa", "Главная")}
        </Link>
        <Link href="/catalog" className="btn btn-outline btn-lg btn-block" style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
          <Icons.Folder size={20} /> {t("Yana xarid qilish", "Вернуться к покупкам")}
        </Link>
        <a href="tel:+998949999599" className="btn btn-ghost" style={{ fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
          <Icons.Phone size={16} /> {t("Aloqa: +998 94 999 95 99", "Связь: +998 94 999 95 99")}
        </a>
      </div>
      </div>
    </div>
  );
}
