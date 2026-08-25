'use client';

import { Check, Circle, MapPin } from 'lucide-react';

import { proofLabel, proofToken, visitProof } from '@/lib/customers/visitProof';

// ══════════════════════════════════════════════════════════════════════
// Один план объезда: кому, сколько выполнено и каждая остановка.
//
// Вынесено из экрана: там дата, переключатели и список планов, здесь —
// одна карточка. Разные поводы для правок.
//
// ЧТО ЗДЕСЬ ВАЖНЕЕ ВСЕГО. Не «выполнено», а ЧЕМ выполнено. Галочка сама по
// себе — это снова слово сотрудника; вес ей даёт стоящее рядом расстояние,
// на котором была поставлена отметка. Поэтому подпись подтверждения стоит
// в строке остановки, а не прячется в карточке клиента.
// ══════════════════════════════════════════════════════════════════════

export interface PlanStopRow {
  customerId: number;
  name: string;
  done: boolean;
  distanceM: number | null;
  accuracyM: number | null;
}

export interface PlanRow {
  id: number;
  assignee: string;
  author: string;
  source: string;
  doneCount: number;
  stops: PlanStopRow[];
}

/** Цвет полосы исполнения: пусто, начато, всё. */
function progressToken(done: number, total: number): string {
  if (total === 0 || done === 0) return 'var(--text-muted)';
  return done === total ? 'var(--success)' : 'var(--warning)';
}

export function AdminVisitPlanRow({
  plan,
  lang,
  onOpenCustomer,
}: {
  plan: PlanRow;
  lang: 'ru' | 'uz';
  onOpenCustomer: (id: number) => void;
}) {
  const total = plan.stops.length;
  const share = total === 0 ? 0 : Math.round((plan.doneCount / total) * 100);

  return (
    <div className="card" style={{ padding: 'var(--space-4)', display: 'grid', gap: 'var(--space-3)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <strong style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-base)' }}>
          {plan.assignee || (lang === 'ru' ? 'Ничей план' : 'Egasiz reja')}
        </strong>

        {/* Кто составил. «Назначен» и «собрал себе» — разные истории: во
            втором случае человек сам решил, куда ехать, и спрашивать с него
            за состав плана не за что. */}
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          {plan.source === 'owner'
            ? `${lang === 'ru' ? 'назначил' : 'tayinladi'} ${plan.author}`
            : lang === 'ru'
              ? 'собрал себе'
              : 'oʻzi tuzgan'}
        </span>

        <span
          style={{
            marginLeft: 'auto',
            fontWeight: 'var(--font-bold)',
            color: progressToken(plan.doneCount, total),
          }}
        >
          {plan.doneCount} / {total}
        </span>
      </div>

      {/* Полоса исполнения: число читается точно, полоса — мгновенно. */}
      <div style={{ height: 6, borderRadius: 'var(--radius-full)', background: 'var(--bg-tertiary)' }}>
        <div
          style={{
            width: `${share}%`,
            height: '100%',
            borderRadius: 'var(--radius-full)',
            background: progressToken(plan.doneCount, total),
            transition: 'width var(--transition-base)',
          }}
        />
      </div>

      <div style={{ display: 'grid', gap: 'var(--space-1)' }}>
        {plan.stops.map((stop, i) => {
          const proof = stop.done ? visitProof(stop.distanceM, stop.accuracyM) : null;

          return (
            <button
              key={stop.customerId}
              type="button"
              onClick={() => onOpenCustomer(stop.customerId)}
              className="btn btn-ghost btn-sm"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                justifyContent: 'flex-start',
                textAlign: 'left',
                minHeight: 44,
                width: '100%',
              }}
            >
              <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', minWidth: 18 }}>
                {i + 1}
              </span>

              {stop.done ? (
                <Check size={15} style={{ color: 'var(--success)', flexShrink: 0 }} />
              ) : (
                <Circle size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              )}

              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: stop.done ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                {stop.name}
              </span>

              {/* Чем подтверждена отметка. Ради этой подписи экран и нужен:
                  галочка без неё — снова слово сотрудника. */}
              {proof && (
                <span
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: proofToken(proof.kind),
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                  }}
                >
                  <MapPin size={12} />
                  {proofLabel(proof, lang)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
