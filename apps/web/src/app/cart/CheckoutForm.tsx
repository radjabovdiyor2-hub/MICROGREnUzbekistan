'use client';

import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  AlertTriangle, ArrowLeft, CheckCircle, Clock, CreditCard, FileText,
  MapPin, Phone, Truck, User, } from 'lucide-react';
import { useLang } from '@/components/providers/LangProvider';
import type { useCart } from '@/components/providers/CartProvider';
import { CheckoutSummary } from './CheckoutSummary';
import { PAYMENT_METHODS, PaymentMethodPicker } from './paymentMethods';

// Форма оформления заказа — второй шаг. Рендерится вместо корзины и экрана
// успеха, поэтому вынесена так же, как CartView.


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
  // Список включённых способов оплаты приходит из настроек (/api/config).
  // Пока он не загрузился — показываем полный каталог: пустой экран оплаты
  // хуже, чем лишняя кнопка на долю секунды.
  const [enabledIds, setEnabledIds] = useState<string[] | null>(null);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.paymentMethods) && d.paymentMethods.length > 0) {
          setEnabledIds(d.paymentMethods as string[]);
        }
      })
      .catch(() => {});
  }, []);

  const enabledMethods = enabledIds
    ? PAYMENT_METHODS.filter((pm) => enabledIds.includes(pm.id))
    : PAYMENT_METHODS;

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
          <PaymentMethodPicker
            methods={enabledMethods}
            selected={form.paymentMethod}
            onSelect={(id) => setForm(p => ({ ...p, paymentMethod: id }))}
            t={t}
          />
        </div>

        <CheckoutSummary
          cart={cart}
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
          fmt={fmt}
          t={t}
        />

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
