// ══════════════════════════════════════════════════════════════════════
// Визит: съездил — отметь результат.
//
// Карта показывала, КУДА ехать, но не помнила, что ты там уже был. Через
// неделю объезда это превращается в вопрос «я к ним заезжал или собирался?»,
// на который отвечает только память.
//
// Пишем в `interactions` — ту же таблицу, куда офис пишет касания. Своя
// таблица «визитов» развела бы историю общения по двум местам, и карточка
// клиента показывала бы половину.
//
// Префикс `visit_` намеренный: отчёты офиса фильтруют по `b2b_offer_*` и
// `outreach` (`sales_bot`, `marketing_bot`), и новое семейство не должно
// в них попасть незамеченным.
// ══════════════════════════════════════════════════════════════════════

export interface VisitOutcome {
  id: string;
  ru: string;
  uz: string;
  /** Значение в `interactions.interaction_type`. */
  type: string;
  /** Токен цвета кнопки — результат читается взглядом, а не чтением. */
  token: string;
}

export const VISIT_OUTCOMES: VisitOutcome[] = [
  {
    id: 'deal',
    ru: 'Договорились',
    uz: 'Kelishdik',
    type: 'visit_deal',
    token: 'var(--success)',
  },
  {
    id: 'callback',
    ru: 'Перезвонить',
    uz: 'Qayta qoʻngʻiroq',
    type: 'visit_callback',
    token: 'var(--warning)',
  },
  {
    id: 'absent',
    ru: 'Не застал',
    uz: 'Topmadim',
    type: 'visit_absent',
    token: 'var(--text-muted)',
  },
  {
    id: 'refused',
    ru: 'Отказ',
    uz: 'Rad etdi',
    type: 'visit_refused',
    token: 'var(--error)',
  },
];

/** Канал: визит — это ноги, а не переписка. Значение по умолчанию у
 *  `interactions.channel` — 'telegram', и оставить его значило бы записать
 *  поездку сообщением в мессенджере. */
export const VISIT_CHANNEL = 'visit';

const BY_TYPE = new Map(VISIT_OUTCOMES.map((o) => [o.type, o]));

/**
 * Известен ли тип визита.
 *
 * `Map`, а не объект с `in`: значение приходит телом запроса, то есть от
 * кого угодно, а `in` видит прототип и отвечает «известен» на
 * `constructor`. Та же осторожность, что у `isCompanyType`.
 */
export function isVisitType(value: unknown): value is string {
  return typeof value === 'string' && BY_TYPE.has(value);
}

export function visitOutcome(type: string): VisitOutcome | null {
  return BY_TYPE.get(type) ?? null;
}

/** Все типы визитов — для выборки «когда я был здесь в последний раз». */
export const VISIT_TYPES: string[] = VISIT_OUTCOMES.map((o) => o.type);

/** Заметка к визиту: длиннее в поле всё равно не набирают. */
export const VISIT_NOTE_MAX = 500;

/**
 * Подпись «когда был».
 *
 * Ноль дней — «сегодня», а не «0 дней назад»: человек, вернувшийся из
 * поездки, читает свою же отметку, и «0 дней» выглядит сбоем.
 */
export function lastVisitLabel(days: number | null, lang: 'ru' | 'uz'): string | null {
  if (days === null) return null;
  if (days === 0) return lang === 'ru' ? 'Были сегодня' : 'Bugun bordik';
  if (days === 1) return lang === 'ru' ? 'Были вчера' : 'Kecha bordik';
  return lang === 'ru' ? `Были ${days} дн. назад` : `${days} kun oldin bordik`;
}
