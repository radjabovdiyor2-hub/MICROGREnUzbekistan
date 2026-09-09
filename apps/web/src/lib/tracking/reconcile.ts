// ══════════════════════════════════════════════════════════════════════
// Сходятся ли время и расстояние.
//
// Здесь превращают два числа в утверждение о человеке — поэтому модуль
// чистый и покрыт тестами: спорить с ним будут числами, и числа должны
// быть воспроизводимыми.
//
// ДИСЦИПЛИНА ЦВЕТА — ТА ЖЕ, ЧТО У `VisitProofLine`: красным светит только
// явное и большое расхождение. Нет эталона, короткое плечо, разница в
// несколько минут — это не улика, а обычная жизнь: пробка у базара,
// закрытый на ремонт проезд, парковка. Обвинять по такому шуму значит
// один раз обвинить невиновного и потерять доверие ко всему признаку.
// ══════════════════════════════════════════════════════════════════════

export type LegVerdict =
  /** Эталона нет — сравнивать не с чем. Это не обвинение и не оправдание. */
  | 'unknown'
  /** Уложился в эталон или почти. */
  | 'normal'
  /** Заметно дольше эталона, но объяснимо. */
  | 'slow'
  /** Дольше настолько, что нужен разговор. */
  | 'suspect';

export interface LegFacts {
  actualSec: number;
  expectedSec: number | null;
}

/**
 * Короткие плечи не судим.
 *
 * На пятиминутной дороге разница в те же пять минут — это один светофор
 * и одно место для парковки, а в процентах она выглядит как двукратное
 * превышение. Ровно так признак и начинает врать: на мелочи.
 */
export const MIN_JUDGED_SEC = 8 * 60;

/**
 * Запас поверх эталона, который не считаем расхождением вовсе.
 *
 * Маршрутизатор считает дорогу от точки до точки, а человеку нужно ещё
 * встать, дойти и найти вход. Четыре минуты — это оно.
 */
export const GRACE_SEC = 4 * 60;

export interface LegThresholds {
  /** Во столько раз дольше эталона — «медленно». */
  slowRatio: number;
  /** Во столько раз дольше — «нужен разговор». */
  suspectRatio: number;
}

export const DEFAULT_THRESHOLDS: LegThresholds = { slowRatio: 1.5, suspectRatio: 2.5 };

export interface LegReconciliation {
  verdict: LegVerdict;
  /** Во сколько раз дольше эталона. `null`, если эталона нет. */
  ratio: number | null;
  /** Насколько дольше эталона, секунды. Отрицательное — быстрее. */
  deltaSec: number | null;
}

export function reconcileLeg(
  facts: LegFacts,
  thresholds: LegThresholds = DEFAULT_THRESHOLDS,
): LegReconciliation {
  const { actualSec, expectedSec } = facts;

  // Ноль в эталоне — это «не считали», а не «дорога занимает нисколько».
  if (expectedSec === null || expectedSec <= 0) {
    return { verdict: 'unknown', ratio: null, deltaSec: null };
  }

  const deltaSec = actualSec - expectedSec;
  const ratio = actualSec / expectedSec;

  // Короткое плечо показываем с числами, но без приговора.
  if (actualSec < MIN_JUDGED_SEC && expectedSec < MIN_JUDGED_SEC) {
    return { verdict: 'normal', ratio, deltaSec };
  }

  // Запас работает В ПОЛЬЗУ сотрудника — так же, как погрешность GPS
  // работает в его пользу при подтверждении визита.
  const overRatio = Math.max(0, deltaSec - GRACE_SEC) / expectedSec + 1;

  if (overRatio >= thresholds.suspectRatio) return { verdict: 'suspect', ratio, deltaSec };
  if (overRatio >= thresholds.slowRatio) return { verdict: 'slow', ratio, deltaSec };
  return { verdict: 'normal', ratio, deltaSec };
}

/**
 * Токен цвета для вердикта. Скупо: цвет здесь — это обвинение.
 *
 * Словарь тот же, что у `proofToken` в `visitProof.ts`, и это намеренно:
 * на одном экране рядом стоят подтверждение визита и сверка плеча, и
 * красный в них обязан значить одно и то же.
 */
export function verdictToken(verdict: LegVerdict): string {
  if (verdict === 'suspect') return 'var(--error)';
  if (verdict === 'slow') return 'var(--text-secondary)';
  return 'var(--text-muted)';
}

export function verdictLabel(verdict: LegVerdict, lang: 'ru' | 'uz'): string {
  const words: Record<LegVerdict, { ru: string; uz: string }> = {
    unknown: { ru: 'эталон не получен', uz: 'me‘yor olinmadi' },
    normal: { ru: 'в норме', uz: 'me‘yorda' },
    slow: { ru: 'дольше обычного', uz: 'odatdagidan uzoq' },
    suspect: { ru: 'намного дольше', uz: 'ancha uzoq' },
  };
  return words[verdict][lang];
}
