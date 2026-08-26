import { formatLocalDate } from '@/lib/localDate';

// ══════════════════════════════════════════════════════════════════════
// Жизнь лотка ГЛАЗАМИ КЛИЕНТА.
//
// Ферма уже ведёт каждую партию по датам: `GrowBatch` знает день посева и
// длительность фаз, а состояние вычисляется, а не хранится. То есть
// цифровой двойник лотка существует давно — его просто никогда не
// показывали тому, кто этот лоток ждёт.
//
// ПОЧЕМУ ОТДЕЛЬНО ОТ `getBatchStatus`
//
// Та функция написана для ГРОВЕРА и говорит его словами: «Продавайте!»,
// «СРОЧНО», «СПИСАНИЕ — товар просрочен». Клиенту такое показывать нельзя
// — он ждёт свою зелень, а не сводку по складу.
//
// Расходится и арифметика, и это не косметика. У гровера прогресс идёт до
// конца СРОКА ХРАНЕНИЯ: для него партия живёт, пока её можно продать. Для
// клиента путь заканчивается ГОТОВНОСТЬЮ — дальше лоток не растёт, а лежит.
// На девятом дне одиннадцатидневного цикла с пятью днями хранения гровер
// видит 56 %, а у клиента лоток почти готов — 82 %. Показать ему 56 %
// значит соврать про его же растение.
//
// ДАТЫ — ПО МЕСТНОМУ ВРЕМЕНИ, И ЭТО НЕ ПРИДИРКА
//
// `getBatchStatus` берёт сегодня как `toISOString().slice(0, 10)`, то есть
// по UTC. Ровно эту ловушку проект уже ловил и описал в `localDate.ts`: с
// полуночи до пяти утра по Ташкенту UTC отдаёт ВЧЕРАШНЕЕ число. Здесь день
// роста — то, что человек читает каждое утро, и «день 4» не должен
// превращаться в «день 3», если открыть приложение до рассвета.
// ══════════════════════════════════════════════════════════════════════

/**
 * `planned` — выбран, но ещё не посеян: у подписки это нормальное
 * состояние между заказом и ближайшей посадкой.
 * `past` — готовность прошла и срок хранения кончился.
 */
export type GrowPhase = 'planned' | 'dark' | 'light' | 'ready' | 'harvested' | 'past';

/** Что случится дальше. `null` — дальше ничего не случится само. */
export type GrowNext = 'sowing' | 'light' | 'ready' | 'pickup';

/** Партия в том виде, в каком её знает ферма. */
export interface GrowSpec {
  /** День посева, «YYYY-MM-DD». Может быть в будущем — партия запланирована. */
  seedDate: string;
  darkDays: number;
  lightDays: number;
  shelfDays: number;
  /** Единственное необратимое состояние: срезано. */
  harvested?: boolean;
}

export interface GrowView {
  phase: GrowPhase;
  /**
   * День роста, считая с единицы: в день посева человек говорит «первый
   * день», а не «нулевой». Разница в один день здесь — разница между
   * понятным и странным.
   */
  day: number;
  /** Сколько всего дней до готовности. Хранение сюда НЕ входит. */
  totalDays: number;
  /** 0…100 — путь до готовности. */
  percent: number;
  next: GrowNext | null;
  /** Дней до следующего события. 0 — оно сегодня. */
  daysToNext: number;
  /** Когда лоток будет готов, «YYYY-MM-DD». */
  readyDate: string;
}

/** Календарных дней между датами. Обе — «YYYY-MM-DD» по местному времени. */
export function daysApart(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00`);
  const b = Date.parse(`${to}T00:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** Прибавить дни к дате «YYYY-MM-DD», не проваливаясь в UTC. */
export function addDays(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00`);
  if (Number.isNaN(base.getTime())) return date;
  base.setDate(base.getDate() + days);
  return formatLocalDate(base);
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * Состояние лотка на сегодня.
 *
 * `today` передаётся параметром, а не берётся изнутри: так функция
 * проверяется тестом без подмены системных часов и одинаково считает на
 * сервере и в браузере.
 */
export function growView(spec: GrowSpec, today: string = formatLocalDate()): GrowView {
  const dark = Math.max(0, Math.floor(spec.darkDays));
  const light = Math.max(0, Math.floor(spec.lightDays));
  const shelf = Math.max(0, Math.floor(spec.shelfDays));

  // Путь клиента кончается готовностью. Ноль дней роста — вырожденная
  // норма культуры; делить на неё нельзя, а показать что-то надо.
  const totalDays = Math.max(1, dark + light);
  const readyDate = addDays(spec.seedDate, dark + light);
  const elapsed = daysApart(spec.seedDate, today);

  // Срезано — конец истории, и дата тут уже ничего не решает.
  if (spec.harvested) {
    return {
      phase: 'harvested',
      day: Math.max(1, elapsed + 1),
      totalDays,
      percent: 100,
      next: null,
      daysToNext: 0,
      readyDate,
    };
  }

  // Ещё не посеян: клиент выбрал культуру, посадка впереди.
  if (elapsed < 0) {
    return {
      phase: 'planned',
      day: 0,
      totalDays,
      percent: 0,
      next: 'sowing',
      daysToNext: -elapsed,
      readyDate,
    };
  }

  const percent = clampPercent((elapsed / totalDays) * 100);
  const day = elapsed + 1;

  if (elapsed < dark) {
    return { phase: 'dark', day, totalDays, percent, next: 'light', daysToNext: dark - elapsed, readyDate };
  }

  if (elapsed < dark + light) {
    return {
      phase: 'light',
      day,
      totalDays,
      percent,
      next: 'ready',
      daysToNext: dark + light - elapsed,
      readyDate,
    };
  }

  // Готов. Дальше он не растёт, а ждёт — и ждать может не бесконечно.
  const leftOnShelf = dark + light + shelf - elapsed;
  if (leftOnShelf > 0) {
    return { phase: 'ready', day, totalDays, percent: 100, next: 'pickup', daysToNext: leftOnShelf, readyDate };
  }

  return { phase: 'past', day, totalDays, percent: 100, next: null, daysToNext: 0, readyDate };
}
