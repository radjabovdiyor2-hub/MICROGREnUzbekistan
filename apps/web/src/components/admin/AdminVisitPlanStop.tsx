'use client';

import { Check, Circle, MapPin } from 'lucide-react';

import { stopState } from '@/lib/customers/planDone';
import { proofLabel, proofToken, visitProof } from '@/lib/customers/visitProof';

import type { PlanStopRow } from './visitPlanRowTypes';

// ══════════════════════════════════════════════════════════════════════
// Одна точка объезда глазами владельца.
//
// ТРИ СОСТОЯНИЯ, А НЕ ДВА, и среднее — то, ради чего экран переделывался.
//
//   ✅ отмечено   — есть визит с исходом, рядом доказательство расстояния;
//   📍 заехал     — есть ручная стоянка, а исхода нет;
//   ○  открыта    — ни того, ни другого.
//
// Раньше состояний было два, и человек, который заехал и не нажал исход,
// выглядел как не заехавший вовсе. Отличить «не был» от «был, но не
// отметил» было нельзя — а это разные разговоры: первый про работу, второй
// про кнопку.
//
// «Заехал» НЕ означает «выполнено»: выполнение — явная отметка человека,
// так решил владелец. Стоянка стоит рядом, а не вместо.
//
// ЦВЕТ НЕ ОБВИНЯЕТ. Средний случай подписан цветом предупреждения, а не
// ошибки: забытая кнопка — это забытая кнопка, а не обман.
// ══════════════════════════════════════════════════════════════════════

/** «14:20» по местному времени. */
function clock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const note = { ru: 'не отмечено', uz: 'belgilanmagan' };

export function AdminVisitPlanStop({
  stop,
  index,
  lang,
  onOpen,
}: {
  stop: PlanStopRow;
  index: number;
  lang: 'ru' | 'uz';
  onOpen: (customerId: number) => void;
}) {
  const state = stopState(stop.done, stop.arrivedAt);
  const proof = state === 'done' ? visitProof(stop.distanceM, stop.accuracyM) : null;
  const minutes = stop.dwellSec === null ? null : Math.round(stop.dwellSec / 60);

  return (
    <button
      type="button"
      onClick={() => onOpen(stop.customerId)}
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
        {index + 1}
      </span>

      {state === 'done' && <Check size={15} style={{ color: 'var(--success)', flexShrink: 0 }} />}
      {state === 'arrived' && (
        <MapPin size={15} style={{ color: 'var(--warning)', flexShrink: 0 }} />
      )}
      {state === 'open' && (
        <Circle size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      )}

      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: state === 'open' ? 'var(--text-secondary)' : 'var(--text-primary)',
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

      {/* Заехал, но исход не нажал. Время и длительность — чтобы вопрос был
          предметным: «был в 14:20 двенадцать минут, что там вышло?» */}
      {state === 'arrived' && stop.arrivedAt && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)', flexShrink: 0 }}>
          {clock(stop.arrivedAt)}
          {minutes !== null ? ` · ${minutes} мин` : ''} · {note[lang]}
        </span>
      )}
    </button>
  );
}
