// ══════════════════════════════════════════════════════════════════════
// Насколько карта готова к поездке.
//
// «На карте 812 из 947» отвечает на вопрос «сколько точек нарисовано», но
// не на тот, который на самом деле задают: по скольким из них можно
// поехать. Точка с точностью «район» стоит в геометрическом центре тумана
// и выглядит ровно так же уверенно, как точка у дверей ресторана. Курьер
// доезжает до пустыря и не понимает, что произошло.
//
// Поэтому покрытие считается тремя корзинами, а не одним числом.
// ══════════════════════════════════════════════════════════════════════

export type CoverageGrade = 'exact' | 'rough' | 'missing';

export interface Coverage {
  /** Точный адрес: геокодер нашёл дом или человек поставил пин руками. */
  exact: number;
  /** Улица, район, город: доехать до квартала можно, до дверей — нет. */
  rough: number;
  /** Координат нет вовсе — клиент в лотке. */
  missing: number;
  total: number;
  /** Доля точных, 0–100. Это и есть «сколько процентов карты готово». */
  percent: number;
}

/**
 * Какие точности считаются пригодными для поездки.
 *
 * `manual` — человек ткнул в карту, и это надёжнее любого геокодера: он
 * видел двор. `exact` — провайдер нашёл дом. Всё остальное грубее.
 */
const DRIVABLE = new Set(['exact', 'manual']);

export interface CoverageRow {
  latitude: number | null;
  longitude: number | null;
  geoSource: string | null;
  geoPrecision: string | null;
}

export function gradeOf(row: CoverageRow): CoverageGrade {
  if (row.latitude === null || row.longitude === null) return 'missing';
  // Пин, поставленный руками, помечен `geoSource`, а не `geoPrecision`:
  // проверять надо оба, иначе ручная работа попадёт в «грубые».
  if (row.geoSource === 'manual') return 'exact';
  return DRIVABLE.has(row.geoPrecision ?? '') ? 'exact' : 'rough';
}

export function computeCoverage(rows: CoverageRow[]): Coverage {
  let exact = 0;
  let rough = 0;
  let missing = 0;

  for (const row of rows) {
    const grade = gradeOf(row);
    if (grade === 'exact') exact++;
    else if (grade === 'rough') rough++;
    else missing++;
  }

  const total = rows.length;
  return {
    exact,
    rough,
    missing,
    total,
    // Округляем ВНИЗ: 99,6 % — это ещё не «сто», и показывать сотню, пока
    // четыре заведения без адреса, значит закрыть вопрос, который открыт.
    percent: total === 0 ? 0 : Math.floor((exact / total) * 100),
  };
}

export const COVERAGE_META: Record<CoverageGrade, { ru: string; uz: string; token: string }> = {
  exact: { ru: 'Точный адрес', uz: 'Aniq manzil', token: 'var(--success)' },
  rough: { ru: 'Примерно', uz: 'Taxminan', token: 'var(--warning)' },
  missing: { ru: 'Без координат', uz: 'Koordinatasiz', token: 'var(--text-muted)' },
};

/**
 * Что делать дальше — одной строкой.
 *
 * Проценты без следующего шага превращаются в укор: человек видит 71 % и
 * не знает, чем это лечить.
 */
export function coverageAdvice(c: Coverage, lang: 'ru' | 'uz'): string {
  if (c.total === 0) {
    return lang === 'ru' ? 'Клиентов пока нет' : 'Mijozlar hali yoʻq';
  }
  if (c.missing > 0) {
    return lang === 'ru'
      ? `${c.missing} без координат — прогоните геокодер в лотке ниже`
      : `${c.missing} ta koordinatasiz — quyida geokoderni ishga tushiring`;
  }
  if (c.rough > 0) {
    return lang === 'ru'
      ? `${c.rough} стоят примерно — поставьте пин руками у тех, к кому поедете`
      : `${c.rough} ta taxminiy — borishdan oldin pinni qoʻlda qoʻying`;
  }
  return lang === 'ru' ? 'Все адреса точные' : 'Barcha manzillar aniq';
}
