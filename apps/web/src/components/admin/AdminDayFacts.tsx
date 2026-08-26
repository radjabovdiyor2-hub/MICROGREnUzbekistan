'use client';

import { MapPin, Receipt } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════
// Что на самом деле произошло за день — рядом с тем, что планировалось.
//
// План отвечал на «куда собирались» и «сколько объехали». Две вещи в нём
// не показывались вовсе, и обе — это и есть работа:
//
//   • ВИЗИТ БЕЗ ПЛАНА. Продавец заехал по дороге и отметился — на экране
//     этого не было, потому что смотрели только на остановки плана.
//     Поездка, которой не видно, читается как безделье;
//
//   • ЧЕК С ВЫЕЗДА. Смысл поездки — продажа, а она лежала в кассе и с днём
//     объезда не сходилась ничем, кроме даты.
//
// Обвинительных цветов здесь нет по той же причине, что и в строке плана:
// у доброй половины поездок GPS не берётся, и красить это красным значит
// однажды потерять доверие ко всему признаку.
// ══════════════════════════════════════════════════════════════════════

export interface DayVisit {
  customerId: number | null;
  name: string;
  actor: string;
  type: string;
  at: string;
  distanceM: number | null;
  accuracyM: number | null;
  planned: boolean;
}

export interface DaySale {
  number: string;
  actor: string;
  customerName: string | null;
  total: number;
  at: string;
}

const VISIT_LABEL: Record<string, string> = {
  visit_deal: 'договорились',
  visit_refused: 'отказ',
  visit_callback: 'перезвонить',
  visit_absent: 'не застали',
};

function hhmm(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function AdminDayFacts({ visits, sales, lang = 'ru', onOpenCustomer }: {
  visits: DayVisit[];
  sales: DaySale[];
  lang?: 'ru' | 'uz';
  onOpenCustomer: (id: number) => void;
}) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);

  const offPlan = visits.filter((v) => !v.planned);
  const revenue = sales.reduce((n, s) => n + s.total, 0);
  const money = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

  if (visits.length === 0 && sales.length === 0) return null;

  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
      {offPlan.length > 0 && (
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-2)' }}>
            <MapPin size={16} /> {t('Визиты вне плана', 'Rejadan tashqari tashriflar')}
            <span style={{ color: 'var(--text-muted)', fontWeight: 'var(--font-normal)' }}>
              ({offPlan.length})
            </span>
          </h4>
          <div style={{ display: 'grid', gap: 6 }}>
            {offPlan.map((v, i) => (
              <div key={`${v.customerId}-${i}`} style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', fontSize: 'var(--text-sm)' }}>
                <span style={{ color: 'var(--text-muted)', minWidth: 42 }}>{hhmm(v.at)}</span>
                <button
                  onClick={() => v.customerId && onOpenCustomer(v.customerId)}
                  disabled={!v.customerId}
                  style={{
                    background: 'none', border: 'none', padding: 0, cursor: v.customerId ? 'pointer' : 'default',
                    color: 'var(--text-primary)', fontWeight: 'var(--font-semibold)', textAlign: 'left',
                  }}
                >
                  {v.name}
                </button>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {VISIT_LABEL[v.type] ?? v.type}
                </span>
                {v.actor && <span style={{ color: 'var(--text-muted)' }}>· {v.actor}</span>}
                {v.distanceM != null && (
                  <span style={{ color: 'var(--text-muted)' }}>· {v.distanceM} м</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {sales.length > 0 && (
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-2)' }}>
            <Receipt size={16} /> {t('Продано с выезда', 'Chiqib sotilgan')}
            <span style={{ marginLeft: 'auto', color: 'var(--brand-primary)' }}>
              {money(revenue)} so&apos;m
            </span>
          </h4>
          <div style={{ display: 'grid', gap: 6 }}>
            {sales.map((s) => (
              <div key={s.number} style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', fontSize: 'var(--text-sm)' }}>
                <span style={{ color: 'var(--text-muted)', minWidth: 42 }}>{hhmm(s.at)}</span>
                <span style={{ fontWeight: 'var(--font-semibold)' }}>
                  {s.customerName || t('без клиента', 'mijozsiz')}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>· {s.actor}</span>
                <span style={{ marginLeft: 'auto' }}>{money(s.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
