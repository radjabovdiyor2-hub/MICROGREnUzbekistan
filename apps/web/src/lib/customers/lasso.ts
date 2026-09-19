// ══════════════════════════════════════════════════════════════════════
// Обвести район на карте и собрать объезд из того, что внутри.
//
// ЗАЧЕМ. Владелец собирает день глазами: «вот этот квартал сегодня». Чтобы
// назначить его, приходилось тыкать точки по одной — двадцать нажатий по
// булавкам размером с ноготь, и промах означает, что точка, которую ты уже
// выбрал, снялась. Обводка спрашивает ровно то, что человек и так держит в
// голове: границу района.
//
// ПРОВЕРКА ИДЁТ В ЭКРАННЫХ КООРДИНАТАХ, А НЕ В ГРАДУСАХ.
//
// Человек обводит то, что ВИДИТ. Проекция карты растягивает широту, и
// контур, замкнутый на экране, в градусах замкнутым быть не обязан —
// особенно у краёв и на наклонённой камере. Считать в пикселях значит
// отвечать на тот же вопрос, который задал человек.
//
// СЛЕДСТВИЕ, О КОТОРОМ НАДО ЗНАТЬ: за границей экрана обводка не работает.
// Это верно по смыслу — нельзя обвести то, чего не видишь.
// ══════════════════════════════════════════════════════════════════════

export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * Короче этого контур считаем случайным касанием, а не обводкой.
 *
 * Палец на тач-экране почти всегда даёт микросдвиг, и без порога каждый
 * тап по карте создавал бы пустое выделение поверх выбора точки.
 */
export const MIN_LASSO_POINTS = 8;

/** Меньше этого по любой стороне — тоже дрожь пальца, а не намерение. */
export const MIN_LASSO_SPAN_PX = 24;

/**
 * Точка внутри контура — метод луча.
 *
 * Луч пускается вправо и считает пересечения со сторонами: нечёт — внутри.
 * Замыкать контур руками не нужно, последняя сторона соединяет конец с
 * началом сама: человек отпускает палец где придётся, и требовать от него
 * попасть в начало — значит не получить ни одного замкнутого контура.
 */
export function pointInPolygon(point: ScreenPoint, polygon: ScreenPoint[]): boolean {
  if (polygon.length < 3) return false;

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];

    // Сторона пересекает горизонталь точки — тогда считаем, справа ли она.
    const crosses = a.y > point.y !== b.y > point.y;
    if (!crosses) continue;

    const at = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (point.x < at) inside = !inside;
  }
  return inside;
}

/** Габарит контура: быстрый отсев до дорогой проверки лучом. */
export function polygonBounds(polygon: ScreenPoint[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  if (polygon.length === 0) return null;
  let minX = polygon[0].x;
  let maxX = polygon[0].x;
  let minY = polygon[0].y;
  let maxY = polygon[0].y;
  for (const p of polygon) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Годится ли нарисованное за обводку.
 *
 * Отсекает случайный тап и черту: и то и другое не выделяет ничего, но
 * успевает стереть прежний выбор, если принять их всерьёз.
 */
export function isUsableLasso(polygon: ScreenPoint[]): boolean {
  if (polygon.length < MIN_LASSO_POINTS) return false;
  const box = polygonBounds(polygon);
  if (!box) return false;
  return (
    box.maxX - box.minX >= MIN_LASSO_SPAN_PX && box.maxY - box.minY >= MIN_LASSO_SPAN_PX
  );
}

/**
 * Разредить контур: точек от пальца приходит по сотне в секунду.
 *
 * Оставляем те, что отстоят от предыдущей оставленной дальше порога. Форма
 * от этого не меняется — меняется цена проверки, которая идёт по каждой
 * стороне для каждой точки карты.
 */
export function thinPath(path: ScreenPoint[], minStepPx = 6): ScreenPoint[] {
  if (path.length <= 2) return [...path];
  const out: ScreenPoint[] = [path[0]];
  for (const p of path) {
    const last = out[out.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) >= minStepPx) out.push(p);
  }
  // Последнюю точку сохраняем всегда: она задаёт замыкающую сторону.
  const tail = path[path.length - 1];
  const last = out[out.length - 1];
  if (last.x !== tail.x || last.y !== tail.y) out.push(tail);
  return out;
}

export interface Projected<T> {
  item: T;
  at: ScreenPoint;
}

/**
 * Что попало внутрь обводки.
 *
 * Сначала габарит, потом луч: на пятистах точках карты разница заметна
 * пальцем, а ответ тот же.
 */
export function selectInside<T>(items: Projected<T>[], polygon: ScreenPoint[]): T[] {
  if (!isUsableLasso(polygon)) return [];
  const box = polygonBounds(polygon);
  if (!box) return [];

  const out: T[] = [];
  for (const { item, at } of items) {
    if (at.x < box.minX || at.x > box.maxX || at.y < box.minY || at.y > box.maxY) continue;
    if (pointInPolygon(at, polygon)) out.push(item);
  }
  return out;
}
