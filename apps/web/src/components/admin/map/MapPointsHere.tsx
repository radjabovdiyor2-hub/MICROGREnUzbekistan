'use client';

import { X } from 'lucide-react';

import { SEGMENT_META } from '@/lib/customers/segments';
import { COMPANY_TYPES } from '@/lib/customers/companyTypes';

import type { PointView } from './mapFeature';

// ══════════════════════════════════════════════════════════════════════
// «Здесь несколько точек».
//
// Кластеризация выключается на зуме 13, и выше него заведения в одном
// здании просто лежат друг на друге: торговый центр, кофейня в нём и
// фитнес этажом выше — три разных клиента в одной координате. Раньше
// нажатие открывало то из них, что MapLibre вернула первым, — то есть
// через раз не то.
//
// Это и есть ответ на задачу, ради которой обычно тянут плагин spiderfy:
// точки не разлетаются веером, а называются списком. Список честнее —
// он показывает, КТО там, ещё до выбора.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  lang: 'ru' | 'uz';
  points: PointView[];
  onPick: (id: number) => void;
  onClose: () => void;
}

export function MapPointsHere({ lang, points, onPick, onClose }: Props) {
  if (points.length === 0) return null;

  return (
    <div
      className="card"
      style={{
        padding: 'var(--space-2)',
        width: 'min(280px, 78vw)',
        boxShadow: 'var(--shadow-lg)',
        display: 'grid',
        gap: 2,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: '0 var(--space-1)',
        }}
      >
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', flex: 1 }}>
          {lang === 'ru' ? `Здесь ${points.length} точки` : `Bu yerda ${points.length} ta`}
        </span>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={onClose}
          aria-label={lang === 'ru' ? 'Закрыть' : 'Yopish'}
          style={{ minWidth: 44 }}
        >
          <X size={14} />
        </button>
      </div>

      {points.map((point) => {
        const meta = SEGMENT_META[point.state];
        const type = point.companyType ? COMPANY_TYPES[point.companyType] : null;
        return (
          <button
            key={point.id}
            type="button"
            onClick={() => onPick(point.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              // Палец, а не курсор: список для того и появился, что в
              // тесноте промахиваются.
              minHeight: 44,
              padding: '0 var(--space-2)',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: 'transparent',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 10,
                height: 10,
                borderRadius: 'var(--radius-full)',
                background: meta.token,
                flexShrink: 0,
              }}
            />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  display: 'block',
                  fontSize: 'var(--text-sm)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {point.name}
              </span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                {type ? type[lang] : meta[lang]}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
