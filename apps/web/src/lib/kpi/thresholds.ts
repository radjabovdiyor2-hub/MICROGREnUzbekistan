import type { MarginRow } from '@/lib/finance/margin';

// ══════════════════════════════════════════════════════════════════════
// Коридоры нормы: когда число становится поводом что-то сделать.
//
// ЗАЧЕМ. Отчёты показывали выход с лотка, долю брака и число клиентов, но
// само число ничего не говорит, пока не задана граница «всё хорошо» и
// «пора реагировать». Заметить выход за неё можно было, только сравнив две
// сводки глазами — то есть случайно.
//
// Здесь только чистые расчёты; загрузка и оповещения — в `watch.ts`.
// Расчёт должен проверяться без базы, иначе его не проверяют вовсе.
// ══════════════════════════════════════════════════════════════════════

export interface Breach {
  metric: 'defect' | 'concentration' | 'customers' | 'visits' | 'supplier';
  title: string;
  detail: string;
}

/**
 * Доля крупнейшего клиента в выручке.
 *
 * Считается от ВСЕЙ выручки, включая розницу и неопознанных покупателей.
 * Если половину оборота приносит прилавок, ни одно заведение не опасно — и
 * делить только на выручку заведений значило бы бить тревогу там, где
 * риска нет.
 *
 * `null`, если выручки не было: доли от нуля не существует.
 */
export function largestClientShare(
  rows: MarginRow[],
  unknownKey = 'unknown',
): { share: number; label: string } | null {
  const total = rows.reduce((sum, r) => sum + r.revenue, 0);
  if (total <= 0) return null;

  // Розница — это множество разных людей, а не один клиент: зависимости
  // от неё в том смысле, в каком она опасна, не возникает.
  const named = rows.filter((r) => r.key !== unknownKey);
  if (named.length === 0) return null;

  const top = named.reduce((best, r) => (r.revenue > best.revenue ? r : best), named[0]);
  return { share: top.revenue / total, label: top.label };
}

/**
 * Доля брака за период.
 *
 * `null`, когда со склада ничего не уходило: ноль читался бы как «брака
 * нет», хотя нечему было испортиться.
 */
export function defectShare(writtenOff: number, sold: number): number | null {
  const total = writtenOff + sold;
  if (total <= 0) return null;
  return writtenOff / total;
}

/** Сложить нарушения коридоров в список для оповещения. */
export function collectBreaches(input: {
  defect: number | null;
  defectLimit: number;
  concentration: { share: number; label: string } | null;
  concentrationLimit: number;
  activeCustomers: number;
  minCustomers: number;
  /** Новых заведений, куда заходили за последнюю неделю. */
  newVisits: number;
  visitNorm: number;
  /** Виды сырья, которые возит ровно один поставщик. */
  soleSourced: string[];
}): Breach[] {
  const breaches: Breach[] = [];

  if (input.defect !== null && input.defect > input.defectLimit) {
    breaches.push({
      metric: 'defect',
      title: `Брак ${Math.round(input.defect * 100)}%`,
      detail:
        `Списано ${Math.round(input.defect * 100)}% при пороге ` +
        `${Math.round(input.defectLimit * 100)}%. Причина обычно не в партии, ` +
        'а в режиме: полив, проветривание или срок срезки.',
    });
  }

  if (input.concentration && input.concentration.share > input.concentrationLimit) {
    breaches.push({
      metric: 'concentration',
      title: `«${input.concentration.label}» — ${Math.round(input.concentration.share * 100)}% выручки`,
      detail:
        'Одно заведение даёт слишком большую долю оборота. Его уход или ' +
        'смена шефа обрушат выручку разом, и заметить это можно будет ' +
        'только постфактум.',
    });
  }

  if (input.activeCustomers < input.minCustomers) {
    breaches.push({
      metric: 'customers',
      title: `Активных заведений: ${input.activeCustomers}`,
      detail:
        `Меньше порога в ${input.minCustomers}. Пока точек мало, любая ` +
        'потеря весит непропорционально много — обходы важнее производства.',
    });
  }

  // Норма заходов. Сбыт из настроения превращается в задачу только тогда,
  // когда у него есть число: без него неделя без единой новой двери
  // выглядит так же, как неделя с пятью, — обе «работали».
  if (input.newVisits < input.visitNorm) {
    breaches.push({
      metric: 'visits',
      title: `Новых заходов за неделю: ${input.newVisits}`,
      detail:
        `Норма — ${input.visitNorm}. Обслуживать своих привычнее: там ждут и ` +
        'не отказывают. Но новые заведения от этого не появляются, и видно ' +
        'это станет через месяц по остановившемуся росту.',
    });
  }

  // Единственный поставщик — это остановка производства, а не неудобство:
  // семена и субстрат заменить в тот же день негде, а цикл не ускорить.
  if (input.soleSourced.length > 0) {
    breaches.push({
      metric: 'supplier',
      title: `Один поставщик: ${input.soleSourced.slice(0, 3).join(', ')}`,
      detail:
        'По этим позициям возит ровно один поставщик. Его отказ, отпуск или ' +
        'поднятая цена останавливают посев — а торговаться, когда выбора ' +
        'нет, не с чем. Три поставщика на позицию — правило, а не запас.',
    });
  }

  return breaches;
}
