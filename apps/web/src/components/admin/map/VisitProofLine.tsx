'use client';

import type { CustomerLastVisit } from '@/lib/customers/card';
import { proofLabel, proofToken, visitProof } from '@/lib/customers/visitProof';
import { visitOutcome } from '@/lib/customers/visits';

// ══════════════════════════════════════════════════════════════════════
// Чем подтверждена последняя поездка к клиенту.
//
// Отметка «был у клиента» до сих пор ничем не подтверждалась: её ставили
// пальцем из любой точки города, и владелец сформулировал это прямо — «а не
// мухлёвка, что сходил, хотя не ходил». Теперь рядом с отметкой видно, где
// стоял телефон в тот момент.
//
// ЦВЕТ ЗДЕСЬ — ЭТО ОБВИНЕНИЕ, поэтому он скупой. Красным светит ТОЛЬКО
// явное «далеко»: расстояние заметно больше квартала при честной точности.
// «Место не подтверждено» и «место неточно» — серым, потому что у доброй
// половины поездок GPS не возьмётся вовсе (подвал, железный павильон,
// отказ в доступе), и красить это обвинительным цветом значит обвинять по
// шуму. Однажды так и потеряют доверие ко всему признаку разом.
// ══════════════════════════════════════════════════════════════════════

export function VisitProofLine({
  visit,
  lang,
}: {
  visit: CustomerLastVisit;
  lang: 'ru' | 'uz';
}) {
  const proof = visitProof(visit.distanceM, visit.accuracyM);

  return (
    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
      {visitOutcome(visit.type)?.[lang] ?? visit.type}
      {' · '}
      <span style={{ color: proofToken(proof.kind) }}>{proofLabel(proof, lang)}</span>
    </div>
  );
}
