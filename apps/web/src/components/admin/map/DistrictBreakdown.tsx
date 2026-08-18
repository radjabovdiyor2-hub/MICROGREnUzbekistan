'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, LayoutGrid } from 'lucide-react';

import { districtLabel } from '@/lib/customers/districts';
import type { DistrictStat } from '@/lib/customers/mapQuery';

import { formatSum } from './mapFeature';

// ══════════════════════════════════════════════════════════════════════
// Разрез по районам: где недобираем.
//
// Это замена хороплету, а не его черновик. Заливка полигонов требует
// границ районов, свободного ODbL-экстракта в репозитории нет, а самый
// известный готовый набор лежит под GPL-3.0 и в проект не годится.
//
// Список отвечает на тот же вопрос и вдобавок называет цифры, которые с
// цветной заливки пришлось бы считывать на глаз: «в Чиланзаре 14 целей и
// 2 клиента» — это план работы, а оттенок зелёного — нет.
//
// Сортировка идёт от худшего: сверху район с наибольшим числом уходящих
// клиентов, при равенстве — где меньше выручки.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  districts: DistrictStat[];
  lang: 'ru' | 'uz';
  /** Клик по строке фильтрует карту по этому району. */
  active: string | null;
  onSelect: (district: string | null) => void;
}

const label = {
  title: { ru: 'По районам', uz: 'Tumanlar boʻyicha' },
  clients: { ru: 'клиентов', uz: 'mijoz' },
  targets: { ru: 'целей', uz: 'nishon' },
  leaving: { ru: 'уходят', uz: 'ketmoqda' },
  empty: { ru: 'Районы не определены', uz: 'Tumanlar aniqlanmagan' },
};

export function DistrictBreakdown({ districts, lang, active, onSelect }: Props) {
  const [open, setOpen] = useState(false);

  if (districts.length === 0) {
    return null;
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-3)',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          color: 'var(--text-primary)',
        }}
      >
        <LayoutGrid size={16} style={{ color: 'var(--brand-primary)' }} />
        <span style={{ flex: 1, textAlign: 'left', fontWeight: 'var(--font-semibold)' }}>
          {label.title[lang]}: {districts.length}
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {open && (
        <div style={{ maxHeight: 260, overflowY: 'auto', borderTop: '1px solid var(--border)' }}>
          {districts.map((d) => {
            const isActive = active === d.district;
            return (
              <button
                key={d.district}
                type="button"
                onClick={() => onSelect(isActive ? null : d.district)}
                aria-pressed={isActive}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-2) var(--space-3)',
                  border: 'none',
                  borderBottom: '1px solid var(--border)',
                  background: isActive ? 'var(--bg-tertiary)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: 'var(--text-primary)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--text-sm)' }}>
                    {districtLabel(d.district, lang)}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    {d.customers} {label.clients[lang]}
                    {d.prospects > 0 && ` · ${d.prospects} ${label.targets[lang]}`}
                    {d.atRisk > 0 && (
                      <span style={{ color: 'var(--warning)' }}>
                        {' '}
                        · {d.atRisk} {label.leaving[lang]}
                      </span>
                    )}
                  </div>
                </div>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  {formatSum(d.revenue)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
