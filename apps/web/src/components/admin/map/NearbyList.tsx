'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Footprints, Plus } from 'lucide-react';

import { SEGMENT_META } from '@/lib/customers/segments';
import { formatKm, nearestPoints, type NearbyPoint } from '@/lib/customers/nearby';

import type { MapFeature, PointView } from './mapFeature';

// ══════════════════════════════════════════════════════════════════════
// «Кто рядом» — соседи выбранной точки.
//
// Самый частый вопрос в поле: раз уж приехал к одному, кто ещё в
// квартале. До этого ответ добывался зумом и памятью, а забытый сосед —
// это ещё одна поездка через весь город на следующей неделе.
//
// Свёрнут по умолчанию: панель точки и так длинная, а вопрос возникает
// не на каждой точке. Сколько соседей нашлось — видно, не раскрывая.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  lang: 'ru' | 'uz';
  /** Выбранная точка — от неё считается расстояние. */
  origin: PointView;
  /** Все видимые точки карты: соседей ищем среди них, а не запросом. */
  features: MapFeature[];
  /** Уже в объезде — этих не предлагаем добавить повторно. */
  inRoute: (id: number) => boolean;
  onAddRoute: (point: NearbyPoint) => void;
  onPick: (id: number) => void;
}

const label = {
  title: { ru: 'Кто рядом', uz: 'Yaqin atrofda' },
  none: { ru: 'В двух километрах больше никого', uz: 'Ikki kilometrda boshqa hech kim yoʻq' },
  add: { ru: 'В объезд', uz: 'Yoʻnalishga' },
};

export function NearbyList({ lang, origin, features, inRoute, onAddRoute, onPick }: Props) {
  const [open, setOpen] = useState(false);

  // Считаем по УЖЕ загруженной коллекции, а не запросом: она целиком
  // здесь, и гонять сервер ради расстояния до соседа незачем. Цели
  // (`k === 'restaurant'`) идут наравне с клиентами — белое пятно по
  // соседству это такой же адрес, куда стоит зайти.
  const neighbours = nearestPoints(
    features.map((f) => ({
      id: f.id,
      name: f.properties.n,
      latitude: f.geometry.coordinates[1],
      longitude: f.geometry.coordinates[0],
      kind: f.properties.k,
      state: f.properties.st,
    })),
    origin,
  );

  return (
    <div style={{ display: 'grid', gap: 'var(--space-1)' }}>
      <button
        type="button"
        className="btn btn-sm btn-ghost"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{ justifyContent: 'flex-start' }}
      >
        <Footprints size={14} />
        {label.title[lang]}
        {` · ${neighbours.length}`}
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && neighbours.length === 0 && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          {label.none[lang]}
        </div>
      )}

      {open &&
        neighbours.map(({ point, km }) => (
          <div key={point.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              type="button"
              onClick={() => onPick(point.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                flex: 1,
                minWidth: 0,
                minHeight: 44,
                padding: '0 var(--space-2)',
                border: 'none',
                background: 'transparent',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 'var(--radius-full)',
                  background: SEGMENT_META[point.state].token,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 'var(--text-sm)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {point.name}
              </span>
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                }}
              >
                {formatKm(km)}
              </span>
            </button>

            {!inRoute(point.id) && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => onAddRoute(point)}
                aria-label={label.add[lang]}
                title={label.add[lang]}
                style={{ minWidth: 44 }}
              >
                <Plus size={14} />
              </button>
            )}
          </div>
        ))}
    </div>
  );
}
