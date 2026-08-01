'use client';

import React from 'react';
import Link from 'next/link';
import { CheckCircle, CreditCard, Folder, Home, MapPin, PartyPopper, Phone, User } from 'lucide-react';
import { PAYMENT_METHODS } from './CheckoutForm';

interface Props {
  orderNumber: string;
  form: {
    firstName: string;
    phone: string;
    address: string;
    paymentMethod: string;
  };
  t: (uz: string, ru: string) => string;
}

export function CartOrderSuccess({ orderNumber, form, t }: Props) {
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
