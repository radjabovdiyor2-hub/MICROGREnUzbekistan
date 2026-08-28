// ══════════════════════════════════════════════════════════════════════
// Экран владельца: жизнь и дело под одним контролем.
//
// ЗАЧЕМ. Из разбора канала три четверти советов — не про код, а про
// человека: приоритеты, состояние, личные деньги, решения, команда. В
// разборах они лежат текстом, который читают один раз. Практика, которую
// прочитали, но не ведут, ничем не отличается от непрочитанной.
//
// ПОЧЕМУ НЕ ВСЁ — ГАЛОЧКИ. Из 279 практик ритм есть у сорока с небольшим.
// Остальное — правила: «невозвратные затраты», «отделять факт от оценки».
// Превратить правило в ежедневную галочку значит получить список, который
// не выполняется целиком ни в один день, и бросить его через неделю.
// Правила поэтому живут отдельно: их берут в работу, а не отмечают.
//
// РИТМ — ПРЕДПОЛОЖЕНИЕ. Расставлен по смыслу практики, но чужая неделя
// видна хуже своей, поэтому владелец меняет его на экране, и его выбор
// главнее того, что записано в каталоге.
// ══════════════════════════════════════════════════════════════════════

/** Ритм повторения. `principle` — не повторяется, а помнится. */
export const RHYTHMS = ['daily', 'weekly', 'monthly', 'quarterly', 'setup', 'principle'] as const;

export type Rhythm = (typeof RHYTHMS)[number];

export const PRACTICE_AREAS = ['time', 'money', 'mind', 'team', 'business'] as const;

export type PracticeArea = (typeof PRACTICE_AREAS)[number];

export interface Practice {
  key: string;
  title: string;
  /** Одной фразой: почему это вообще стоит делать. */
  why: string;
  rhythm: Rhythm;
  /** Номера видео канала, откуда взято. */
  videos: string[];
}

export const AREA_LABELS: Record<PracticeArea, { ru: string; uz: string }> = {
  time: { ru: 'Время и состояние', uz: 'Vaqt va holat' },
  money: { ru: 'Личные деньги', uz: 'Shaxsiy pul' },
  mind: { ru: 'Мышление и решения', uz: 'Tafakkur va qarorlar' },
  team: { ru: 'Команда и делегирование', uz: 'Jamoa va topshiriq' },
  business: { ru: 'Дело', uz: 'Ish' },
};

export const RHYTHM_LABELS: Record<Rhythm, { ru: string; uz: string }> = {
  daily: { ru: 'Каждый день', uz: 'Har kuni' },
  weekly: { ru: 'Раз в неделю', uz: 'Haftada bir' },
  monthly: { ru: 'Раз в месяц', uz: 'Oyda bir' },
  quarterly: { ru: 'Раз в квартал', uz: 'Chorakda bir' },
  setup: { ru: 'Разово', uz: 'Bir marta' },
  principle: { ru: 'Правило', uz: 'Qoida' },
};

/** Сколько дней держится отметка, прежде чем практика снова «должна». */
export const RHYTHM_DAYS: Record<Rhythm, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  quarterly: 91,
  // Разовое не возвращается никогда, правило не отмечается вовсе.
  setup: Number.POSITIVE_INFINITY,
  principle: Number.POSITIVE_INFINITY,
};

export function isRhythm(value: unknown): value is Rhythm {
  return typeof value === 'string' && (RHYTHMS as readonly string[]).includes(value);
}

export function isPracticeArea(value: unknown): value is PracticeArea {
  return typeof value === 'string' && (PRACTICE_AREAS as readonly string[]).includes(value);
}
