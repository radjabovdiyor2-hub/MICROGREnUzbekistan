'use client';

import { useMemo } from 'react';

import {
  BUCKET_META,
  COLOR_BUCKETS,
  bucketOf,
  type ColorBucket,
} from '@/lib/customers/companyTypes';

import { bucketColor } from './mapLayers';
import type { MapFeature } from './mapFeature';
import { useTokenColors } from './useTokenColors';

// ══════════════════════════════════════════════════════════════════════
// Легенда раскраски по типу заведения.
//
// Считается по точкам, которые СЕЙЧАС на карте, а не по сводке с сервера.
// Причина в слое целей: он подмешивается к коллекции уже после сборки
// summary, и легенда, взятая из сводки, показывала бы меньше точек, чем
// нарисовано. Расхождение цифры в легенде с картинкой — это ровно то, что
// заставляет перестать доверять обеим.
//
// Клика по строке здесь нет намеренно: отбор по типу живёт в ленте чипов
// сверху, и второй орган управления тем же фильтром означал бы два места,
// где показано состояние одного и того же выбора.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  features: MapFeature[];
  lang: 'ru' | 'uz';
}

export function CategoryLegend({ features, lang }: Props) {
  const colors = useTokenColors();

  const counts = useMemo(() => {
    const acc = {} as Record<ColorBucket, number>;
    for (const f of features) {
      const bucket = bucketOf(f.properties.ct);
      acc[bucket] = (acc[bucket] ?? 0) + 1;
    }
    return acc;
  }, [features]);

  const visible = COLOR_BUCKETS.filter((b) => (counts[b] ?? 0) > 0);
  if (visible.length === 0) return null;

  return (
    <div
      className="card"
      style={{ padding: 'var(--space-3)', display: 'grid', gap: 'var(--space-1)' }}
    >
      {visible.map((bucket) => (
        <div
          key={bucket}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-1) var(--space-2)',
          }}
        >
          <span
            aria-hidden
            style={{
              width: 12,
              height: 12,
              borderRadius: 'var(--radius-full)',
              background: bucketColor(colors, bucket),
              flexShrink: 0,
            }}
          />
          <span style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
            {BUCKET_META[bucket][lang]}
          </span>
          <span
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--font-semibold)',
              color: 'var(--text-primary)',
            }}
          >
            {counts[bucket]}
          </span>
        </div>
      ))}
    </div>
  );
}
