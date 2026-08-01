'use client';

import type React from 'react';
import type { Dispatch, SetStateAction } from 'react';

// Форма создания промокода: код, тип скидки, лимиты, срок.
// Вынесено из AdminPromo: форма показывается по флагу и от списка не зависит.

interface Props {
  code: string;
  setCode: (v: string) => void;
  discountType: 'percent' | 'fixed';
  setDiscountType: Dispatch<SetStateAction<'percent' | 'fixed'>>;
  value: number;
  setValue: Dispatch<SetStateAction<number>>;
  minSubtotal: number;
  setMinSubtotal: Dispatch<SetStateAction<number>>;
  maxUses: string;
  setMaxUses: (v: string) => void;
  expiresAt: string;
  setExpiresAt: (v: string) => void;
  saving: boolean;
  create: (e: React.FormEvent) => void;
  t: (ru: string, uz: string) => string;
  inputStyle: React.CSSProperties;
}

export function AdminPromoForm({ code, setCode, discountType, setDiscountType, value, setValue, minSubtotal, setMinSubtotal, maxUses, setMaxUses, expiresAt, setExpiresAt, saving, create, t, inputStyle }: Props) {
  return (
      <form onSubmit={create} className="card" style={{ padding: 'var(--space-5)', borderRadius: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)' }}>
          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
              {t('Код', 'Kod')}
            </label>
            <input value={code} onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="SUMMER25" style={inputStyle} required />
          </div>

          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
              {t('Тип скидки', 'Chegirma turi')}
            </label>
            <select value={discountType} onChange={e => setDiscountType(e.target.value as 'percent' | 'fixed')}
              style={inputStyle}>
              <option value="percent">{t('Процент (%)', 'Foiz (%)')}</option>
              <option value="fixed">{t('Фиксированная (сум)', 'Belgilangan (so\'m)')}</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
              {discountType === 'percent' ? t('Скидка, %', 'Chegirma, %') : t('Скидка, сум', 'Chegirma, so\'m')}
            </label>
            <input type="number" min={1} max={discountType === 'percent' ? 100 : undefined}
              value={value} onChange={e => setValue(Number(e.target.value))} style={inputStyle} required />
          </div>

          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
              {t('Мин. сумма заказа', 'Min. buyurtma summasi')}
            </label>
            <input type="number" min={0} value={minSubtotal}
              onChange={e => setMinSubtotal(Number(e.target.value))} style={inputStyle} />
          </div>

          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
              {t('Лимит применений', 'Qo\'llash limiti')}
            </label>
            <input type="number" min={1} value={maxUses} onChange={e => setMaxUses(e.target.value)}
              placeholder={t('без лимита', 'limitsiz')} style={inputStyle} />
          </div>

          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
              {t('Действует до', 'Amal qiladi')}
            </label>
            <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} style={inputStyle} />
          </div>
        </div>

        <button type="submit" disabled={saving} className="btn btn-primary" style={{ marginTop: 'var(--space-4)' }}>
          {saving ? t('Создание…', 'Yaratilmoqda…') : t('Создать', 'Yaratish')}
        </button>
      </form>
  );
}
