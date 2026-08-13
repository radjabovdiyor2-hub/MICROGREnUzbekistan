'use client';

import { Check } from 'lucide-react';
import { useLang } from '@/components/providers/LangProvider';
import { SUBSCRIPTION_PLANS, PLAN_CODES } from '@/lib/subscriptions/plans';

interface Props {
  selected: string;
  onSelect: (code: string) => void;
}

/** Карточки тарифов подписки. Цену не показывают: она складывается из состава,
 *  а состав клиент собирает ниже по странице. Тариф задаёт только скидку. */
export function BalansPlanCards({ selected, onSelect }: Props) {
  const { lang, t } = useLang();

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      gap: 'var(--space-3)',
    }}>
      {PLAN_CODES.map((code) => {
        const plan = SUBSCRIPTION_PLANS[code];
        const active = selected === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => onSelect(code)}
            style={{
              textAlign: 'left',
              padding: 'var(--space-4)',
              borderRadius: 'var(--radius-md)',
              border: active ? '2px solid var(--brand-primary)' : '1px solid var(--border)',
              background: active ? 'var(--brand-primary-light)' : 'var(--bg-primary)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: 6 }}>
              {active && <Check size={16} color="var(--brand-primary)" />}
              {lang === 'ru' ? plan.nameRu : plan.nameUz}
            </div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 8 }}>
              {lang === 'ru' ? plan.descriptionRu : plan.descriptionUz}
            </div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--brand-primary)' }}>
              −{plan.discountPercent}% {t('chegirma', 'скидка')}
            </div>
          </button>
        );
      })}
    </div>
  );
}
