import { COOLDOWN_DAYS, isPlannable, planScore, type PlanCandidate } from './dayPlan';
import { distanceKm, type Coords, type RoutePoint } from './dayRoute';
import { NEARBY_MAX_KM, formatKm } from './nearby';

// ══════════════════════════════════════════════════════════════════════
// «Куда дальше» — три строки, а не приказ.
//
// ЧЕМ ОТЛИЧАЕТСЯ ОТ ПЛАНА НА ДЕНЬ. `dayPlan` отвечает на вопрос «кого
// достоин целый день» и собирается утром на восемь точек. Здесь вопрос
// другой и задаётся посреди дня, между двумя заездами: «куда заехать
// сейчас». Поэтому и потолок другой — два километра из «Кто рядом», а не
// двадцать пять: это ещё один заезд по пути, а не отдельная поездка.
//
// РОЛЬ НЕ СПРАШИВАЕТСЯ. У владельца человек бывает совмещённый — и
// продавец, и водитель. Спросить «он водитель или продавец» значит однажды
// ответить неверно и показать половину его же работы. Решает не должность,
// а то, что на него назначено сегодня.
//
// ДВЕ КОРЗИНЫ, А НЕ ОДИН ВЕС.
//   1. Назначенное — точки объезда и адреса рейса вперемешку, ближайшие
//      первыми. Выбор здесь уже сделал человек, и пересчитывать его нечем.
//   2. Соседи — и ТОЛЬКО когда первая корзина пуста. Пока у человека есть
//      неотмеченная точка или неотвезённая посылка, чужих предложений он не
//      видит: с грузом в машине «загляните в кафе рядом» — это шум, из-за
//      которого перестают читать и полезные подсказки.
//
// Склеить корзины одним весом нельзя: сосед в двухстах метрах обошёл бы
// назначенную точку в трёх километрах — по весу, который для этого вопроса
// никто не настраивал, и молча.
//
// ПРИЧИНА ОБЯЗАТЕЛЬНА. Список без причин читается как распоряжение, а
// решает человек: он знает про обед на кухне и про то, что к одним лучше
// заезжать с утра.
// ══════════════════════════════════════════════════════════════════════

/** Сколько подсказок показываем. Больше трёх за рулём не выбирают. */
export const NEXT_LIMIT = 3;

/** Откуда взялась точка. Соседа от назначенного человек должен отличать. */
export type NextKind = 'plan' | 'delivery' | 'nearby';

export interface NextCandidate extends PlanCandidate {
  kind: NextKind;
  /**
   * Номер в замысле владельца. `null` — это сосед, а не назначенная точка.
   *
   * Печатается человеку как есть: увидев «ближайшая из ваших — №5», он
   * понимает, что ему предлагают перескочить с №2, и волен не соглашаться.
   */
  orderIndex: number | null;
}

export interface NextSuggestion {
  point: RoutePoint;
  kind: NextKind;
  km: number;
  /** «400 м» вместо «0.4 км»: за рулём не пересчитывают в уме. */
  kmLabel: string;
  /** Почему предложено — словами. */
  reason: string;
  orderIndex: number | null;
}

/** Назначенное — это план и рейс. Сосед назначенным не является. */
function isAssigned(candidate: NextCandidate): boolean {
  return candidate.kind === 'plan' || candidate.kind === 'delivery';
}

/**
 * Почему эта точка предложена.
 *
 * У назначенного причина — сам факт назначения: человеку важно видеть, что
 * это его работа, а не догадка системы. У соседа причина — состояние
 * клиента, то же самое, по которому его отбирает `planScore`.
 */
export function nextReason(candidate: NextCandidate): string {
  if (candidate.kind === 'plan') {
    return candidate.orderIndex === null
      ? 'в вашем объезде'
      : `в объезде, точка №${candidate.orderIndex + 1}`;
  }
  if (candidate.kind === 'delivery') {
    return candidate.orderIndex === null
      ? 'в вашем рейсе'
      : `в рейсе, адрес №${candidate.orderIndex + 1}`;
  }
  if (candidate.state === 'at_risk') return 'рядом, на грани ухода';
  if (candidate.state === 'lost') return 'рядом, давно не заказывает';
  if ((candidate.overdueRatio ?? 0) >= 2) return 'рядом, просрочен вдвое';
  if (candidate.state === 'prospect') return 'рядом, ещё не заезжали';
  if (candidate.lastVisitDays !== null) return `рядом, были ${candidate.lastVisitDays} дн. назад`;
  return 'рядом';
}

/**
 * Что предложить человеку прямо сейчас.
 *
 * `from` — где он по данным трека. Без позиции подсказки не строятся вовсе:
 * «ближайший» без точки отсчёта — это просто список, выданный за совет.
 */
export function rankNextStops(
  candidates: NextCandidate[],
  from: Coords | null,
  limit: number = NEXT_LIMIT,
): NextSuggestion[] {
  if (!from) return [];

  const show = (candidate: NextCandidate): NextSuggestion => {
    const km = distanceKm(from, candidate);
    return {
      point: {
        id: candidate.id,
        name: candidate.name,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
      },
      kind: candidate.kind,
      km,
      kmLabel: formatKm(km),
      reason: nextReason(candidate),
      orderIndex: candidate.orderIndex,
    };
  };

  // Корзина 1. Сортировка устойчива, и вход приходит по `orderIndex` —
  // значит при равном расстоянии сохраняется порядок владельца. Это не
  // случайность, а условие: у него свой тест.
  const assigned = candidates
    .filter((c) => isAssigned(c) && Number.isFinite(c.latitude) && Number.isFinite(c.longitude))
    .sort((a, b) => distanceKm(from, a) - distanceKm(from, b));

  if (assigned.length > 0) return assigned.slice(0, limit).map(show);

  // Корзина 2 — только теперь. `isPlannable` отсекает тех, к кому заезжали
  // в последние `COOLDOWN_DAYS` дней: повторный заход через сутки читается
  // как назойливость, и это правило уже принято в плане на день.
  return candidates
    .filter((c) => c.kind === 'nearby')
    .filter((c) => isPlannable(c, from))
    .filter((c) => distanceKm(from, c) <= NEARBY_MAX_KM)
    .sort((a, b) => planScore(b, from) - planScore(a, from))
    .slice(0, limit)
    .map(show);
}

/** Что отвечает дверь «мой день» про подсказки. */
export interface NextAnswer {
  gate: 'shift' | 'position' | null;
  gateText: string | null;
  next: NextSuggestion[];
}

/**
 * Разобрать ответ двери, НЕ ДОВЕРЯЯ его форме.
 *
 * ЗАЧЕМ ПРОВЕРЯТЬ УСПЕШНЫЙ ОТВЕТ. Двести с пустым телом — это не «подсказок
 * нет», а «ответил кто-то другой»: так отвечает заглушка в сценарии, так
 * ответит прокси, потерявший маршрут, и так же выглядит старая версия
 * двери после отката. Экран, который в этот момент идёт в `next.map`,
 * падает целиком и уносит с собой соседние панели — а выглядит это как
 * поломка карты, а не как несогласованный ответ.
 *
 * Ровно на этом и упал набор в CI: сценарии карты глушат все адреса пустым
 * объектом, а локальный прогон шёл против живой двери и ничего не заметил.
 */
export function readNextAnswer(body: unknown): NextAnswer {
  const raw = (body ?? {}) as Partial<NextAnswer>;
  const gate = raw.gate === 'shift' || raw.gate === 'position' ? raw.gate : null;
  return {
    gate,
    // Причина без запрета и запрет без причины одинаково бессмысленны.
    gateText: gate === null ? null : (raw.gateText ?? ''),
    next: Array.isArray(raw.next) ? raw.next : [],
  };
}

export { COOLDOWN_DAYS, NEARBY_MAX_KM };
