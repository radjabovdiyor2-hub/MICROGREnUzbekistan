'use client';

import type { Dispatch, SetStateAction } from 'react';
import {
  AlertTriangle, ArrowLeft, Banknote, CheckCircle, Clock, CreditCard, FileText,
  MapPin, PartyPopper, Phone, Smartphone, Sparkles, Truck, User, XCircle,
} from 'lucide-react';
import { useLang } from '@/components/providers/LangProvider';
import type { useCart } from '@/components/providers/CartProvider';

// Форма оформления заказа — второй шаг. Рендерится вместо корзины и экрана
// успеха, поэтому вынесена так же, как CartView.

export const PAYMENT_METHODS = [
  { id: 'cash', labelUz: 'Naqd pul', labelRu: 'Наличные', icon: <Banknote size={18} />, descUz: "Yetkazib berishda to'lang", descRu: "Оплата при доставке" },
  { id: 'click', labelUz: 'Click', labelRu: 'Click', icon: <Smartphone size={18} />, descUz: "Click ilovasi orqali", descRu: "Через приложение Click" },
  { id: 'payme', labelUz: 'Payme', labelRu: 'Payme', icon: <CreditCard size={18} />, descUz: "Payme ilovasi orqali", descRu: "Через приложение Payme" },
];

type CheckoutFields = {
  firstName: string;
  phone: string;
  address: string;
  note: string;
  paymentMethod: string;
};

type Promo = { code: string; discount: number } | null;

interface Props {
  cart: ReturnType<typeof useCart>;
  form: CheckoutFields;
  setForm: Dispatch<SetStateAction<CheckoutFields>>;
  errors: Record<string, string>;
  apiError: string;
  isSubmitting: boolean;
  grandTotal: number;
  bonusBalance: number;
  bonusApplied: number;
  useBonus: boolean;
  setUseBonus: (v: boolean) => void;
  promo: Promo;
  setPromo: Dispatch<SetStateAction<Promo>>;
  promoInput: string;
  setPromoInput: (v: string) => void;
  promoState: 'idle' | 'checking' | 'error';
  setPromoState: Dispatch<SetStateAction<'idle' | 'checking' | 'error'>>;
  promoApplied: number;
  promoError: string;
  applyPromo: () => void;
  handleSubmitOrder: () => void;
  fmt: (n: number) => string;
  setStep: (s: 'cart' | 'checkout' | 'success') => void;
}

export function CheckoutForm(props: Props) {
  const { t } = useLang();
  const {
    cart, form, setForm, errors, apiError, isSubmitting, grandTotal,
    bonusBalance, bonusApplied, useBonus, setUseBonus,
    promo, setPromo, promoInput, setPromoInput, promoState, setPromoState,
    promoApplied, promoError, applyPromo, handleSubmitOrder, fmt, setStep,
  } = props;

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
