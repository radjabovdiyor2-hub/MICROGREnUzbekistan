'use client';

import React, { Dispatch, SetStateAction } from 'react';
import { AlertTriangle, CheckCircle, PartyPopper, Sparkles, XCircle } from 'lucide-react';
import type { useCart } from '@/components/providers/CartProvider';

type Promo = { code: string; discount: number } | null;

interface Props {
  cart: ReturnType<typeof useCart>;
  grandTotal: number;
  bonusBalance: number;
  bonusApplied: number;
  /** Порог списания баллов из настроек. null — ещё не загрузился. */
  minCashout: number | null;
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
  fmt: (n: number) => string;
  t: (uz: string, ru: string) => string;
}

export function CheckoutSummary({
  cart, grandTotal, bonusBalance, bonusApplied, minCashout, useBonus, setUseBonus,
  promo, setPromo, promoInput, setPromoInput, promoState, setPromoState,
  promoApplied, promoError, applyPromo, fmt, t,
}: Props) {
  // Списание возможно только с порога. Раньше галочка появлялась при любом
  // ненулевом балансе, «Итого» уменьшалось на всю сумму баллов, а сервер при
  // балансе ниже порога молча списывал ноль: клиент видел одну сумму, а
  // курьер называл другую.
  const bonusEligible = minCashout === null || bonusBalance >= minCashout;
  return (
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
      {bonusBalance > 0 && bonusEligible && (
        <label htmlFor="use-bonus" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: 'var(--space-3)', fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'var(--font-medium)' }}>
            <Sparkles size={16} /> {t(`${fmt(bonusBalance)} ball ishlatish`, `Списать ${fmt(bonusBalance)} баллов`)}
          </span>
          <input id="use-bonus" type="checkbox" checked={useBonus} onChange={e => setUseBonus(e.target.checked)}
            style={{ accentColor: 'var(--brand-primary)', width: 18, height: 18 }} />
        </label>
      )}
      {bonusBalance > 0 && !bonusEligible && minCashout !== null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          <Sparkles size={14} />
          {t(
            `${fmt(bonusBalance)} ball. Yechish uchun kamida ${fmt(minCashout)} kerak`,
            `${fmt(bonusBalance)} баллов. Списать можно от ${fmt(minCashout)}`,
          )}
        </div>
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
  );
}
