// ══════════════════════════════════════════════════════════════════════
// Что человек имел в виду, ткнув в карту.
//
// MapLibre умеет подписаться на клик по конкретному слою — и попадание
// тогда считается по ОТРИСОВАННОМУ пикселю. На карте клиентов это значит
// мишень в 12 пикселей: `pointRadius()` даёт радиус 6 у обычного клиента.
// Мышью попасть можно, пальцем — нет, а карту носят в поле, в телефоне.
// В globals.css правило записано давно («Палец — не мышь»), и `.btn-sm`
// получает 44px при `pointer: coarse`; на карту его не распространили.
//
// Поэтому запрос идёт РАМКОЙ вокруг точки касания, а разбор попавшего —
// здесь. Модуль чистый: на вход список кандидатов в экранных координатах,
// на выход решение. Из-за этого он проверяется тестом в узловом
// окружении, как и весь остальной lib (jsdom в проекте нет).
// ══════════════════════════════════════════════════════════════════════

/** Точка в пикселях холста. */
export interface ScreenPoint {
  x: number;
  y: number;
}

/** Фича, попавшая в рамку, уже переведённая в экранные координаты. */
export interface HitCandidate {
  /** id фичи: у клиента положительный, у цели отрицательный. */
  id: number;
  /** Слой, из которого фича пришла. */
  layer: string;
  /** Центр фичи на экране. */
  at: ScreenPoint;
  /** Номер кластера. Есть только у кластеров. */
  clusterId?: number;
}

/**
 * Радиус рамки попадания в пикселях.
 *
 * 12 под палец — половина от 24, то есть заметно меньше рекомендованных
 * WCAG 2.5.8 сорока четырёх. Больше брать нельзя: на карте точки стоят
 * вплотную, и щедрая рамка начала бы хватать соседа вместо того, во что
 * человек целился. Недостающее добирает выбор из нескольких (`stackedHits`).
 *
 * 4 под курсор — не ноль: попасть мышью ровно в центр шестипиксельной
 * точки тоже не подарок.
 */
export const HIT_PX_COARSE = 12;
export const HIT_PX_FINE = 4;

/**
 * Насколько близко должны стоять точки, чтобы считаться стопкой.
 *
 * Кластеризация выключается на зуме 13 (`clusterMaxZoom`), и выше него
 * заведения в одном здании просто лежат друг на друге. Угадывать за
 * человека, какое из них он имел в виду, — значит через раз открывать не
 * ту карточку.
 */
export const STACK_PX = 8;

export function hitRadius(coarsePointer: boolean): number {
  return coarsePointer ? HIT_PX_COARSE : HIT_PX_FINE;
}

/** Рамка запроса вокруг касания: [[left, top], [right, bottom]]. */
export function hitBox(
  point: ScreenPoint,
  radius: number,
): [[number, number], [number, number]] {
  return [
    [point.x - radius, point.y - radius],
    [point.x + radius, point.y + radius],
  ];
}

function distance(a: ScreenPoint, b: ScreenPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Приоритет при равном расстоянии: мелкое и точное побеждает крупное.
 *
 * Совпадение до пикселя случается, только когда две фичи стоят в одних
 * координатах, — но порядок всё равно должен быть определённым, иначе
 * один и тот же тап давал бы разные ответы.
 */
const LAYER_ORDER = ['customers-points', 'customers-prospects', 'customers-clusters'];

function rank(layer: string): number {
  const index = LAYER_ORDER.indexOf(layer);
  return index === -1 ? LAYER_ORDER.length : index;
}

/**
 * Кандидаты по возрастанию расстояния от касания.
 *
 * Считаем по ЦЕНТРУ фичи, а не по факту попадания в её заливку: рамка
 * возвращает и кластер радиусом 40, если она задела его край. Тап по
 * маленькой точке на краю большого кластера обязан выбрать точку.
 */
export function sortHits(candidates: HitCandidate[], point: ScreenPoint): HitCandidate[] {
  return [...candidates].sort((a, b) => {
    const byDistance = distance(a.at, point) - distance(b.at, point);
    if (byDistance !== 0) return byDistance;
    return rank(a.layer) - rank(b.layer);
  });
}

/** Ближайшее к касанию. null — рамка пуста, человек ткнул в карту. */
export function pickHit(
  candidates: HitCandidate[],
  point: ScreenPoint,
): HitCandidate | null {
  return sortHits(candidates, point)[0] ?? null;
}

/** Кластер обрабатывается иначе: не выбирается, а раскрывается. */
export function isCluster(hit: HitCandidate | null): boolean {
  return hit?.clusterId !== undefined;
}

/**
 * Стопка точек под пальцем: те, что стоят вплотную к ближайшей.
 *
 * Возвращает пустой массив, когда стопки нет, — то есть когда кандидат
 * один или остальные заметно дальше. Кластеры сюда не попадают: у них
 * своё поведение, и смешивать «раскрыть группу» с «выбрать из списка»
 * значит сделать два разных действия одной кнопкой.
 */
export function stackedHits(
  candidates: HitCandidate[],
  point: ScreenPoint,
  stackPx: number = STACK_PX,
): HitCandidate[] {
  const sorted = sortHits(candidates, point).filter((hit) => !isCluster(hit));
  if (sorted.length < 2) return [];

  const nearest = distance(sorted[0].at, point);
  const stack = sorted.filter((hit) => distance(hit.at, point) - nearest <= stackPx);
  return stack.length >= 2 ? stack : [];
}
