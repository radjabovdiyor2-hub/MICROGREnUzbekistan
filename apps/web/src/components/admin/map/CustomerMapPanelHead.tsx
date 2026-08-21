'use client';

import { X } from 'lucide-react';

import {
  AUDIENCE_RELEVANT,
  audienceLabel,
  companyTypeLabel,
} from '@/lib/customers/companyTypes';
import { SEGMENT_META } from '@/lib/customers/segments';

import { type PointView } from './mapFeature';

// ══════════════════════════════════════════════════════════════════════
// Шапка панели точки: кто это, в каком он состоянии и куда ехать.
//
// Вынесена из CustomerMapPanel, когда та перешагнула 200 строк: панель
// отвечает за данные и действия, шапка — за то, что человек читает
// первым. Адрес здесь же, а не в карточке: он приезжает вместе с точкой и
// нужен ровно в тот момент, когда по ней ткнули.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  point: PointView;
  lang: 'ru' | 'uz';
  onClose: () => void;
}

export function CustomerMapPanelHead({ point, lang, onClose }: Props) {
  const meta = SEGMENT_META[point.state];

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
      <div style={{ flex: 1 }}>
        <h3 style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-lg)' }}>{point.name}</h3>

        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 4,
            padding: '2px 10px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--bg-tertiary)',
            fontSize: 'var(--text-xs)',
          }}
        >
          <span
            aria-hidden
            style={{ width: 8, height: 8, borderRadius: '50%', background: meta.token }}
          />
          {meta[lang]}
        </div>

        {/* Тип заведения рядом с состоянием: цвет точки на карте отвечает за
            корзину («Фитнес и спорт»), а здесь виден точный тип и пол зала —
            то, чем корзина и отличается от категории. */}
        {point.companyType && (
          <div style={{ marginTop: 4, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {companyTypeLabel(point.companyType, lang)}
            {AUDIENCE_RELEVANT.includes(point.companyType) &&
              ` · ${audienceLabel(point.audience, lang)}`}
          </div>
        )}

        {/* Адрес: раньше его не было в панели вовсе — курьер видел название и
            пин, но не знал, куда идти, когда пин стоит посреди квартала. */}
        {point.address && (
          <div
            style={{ marginTop: 4, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}
          >
            {point.address}
          </div>
        )}
      </div>

      <button
        type="button"
        className="btn btn-sm btn-ghost"
        onClick={onClose}
        aria-label={lang === 'ru' ? 'Закрыть' : 'Yopish'}
        style={{ minHeight: 44, minWidth: 44 }}
      >
        <X size={16} />
      </button>
    </div>
  );
}
