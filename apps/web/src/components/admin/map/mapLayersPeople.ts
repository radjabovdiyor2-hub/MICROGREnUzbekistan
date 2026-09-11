import { SILENT_MIN } from '@/lib/tracking/ping';

import { MAP_FONT } from './mapFont';
import { trackSegments, type TrackPoint } from './mapLayersTrack';
import type { TokenColors } from './useTokenColors';

// ══════════════════════════════════════════════════════════════════════
// Слой людей: где сейчас продавцы и водители.
//
// ЗАЧЕМ НА ОБЩЕЙ КАРТЕ. Отдельный экран отвечал на «где все», но не давал
// главного: человек и клиенты видны врозь, а вопрос всегда общий — «кто
// рядом с кем». Отсюда и решения дня: кому передать точку, кто успеет
// заехать ещё раз, почему у заведения никто не был.
//
// ЧЕМ ОТЛИЧАЕТСЯ ОТ КЛИЕНТА, И ЭТО ГЛАВНОЕ. Клиент — место, оно стоит.
// Человек — движется, и рядом с ним имя. Поэтому у людей другая форма
// (кольцо, а не заливка), другой цвет (фирменный, а не шкала состояний) и
// всегда видимая подпись. Один и тот же кружок для места и для человека
// сделал бы карту нечитаемой ровно там, где на неё смотрят быстро.
//
// ЦВЕТ НЕ ОБВИНЯЕТ И ЗДЕСЬ. Потерявший связь гаснет до серого — это про
// связь, а не про человека; красным светил бы каждый подвал.
//
// И ЛИНИЯ РВЁТСЯ ТАМ ЖЕ, ГДЕ НА КАРТЕ ДНЯ. Раньше путь человека рисовался
// здесь ОДНОЙ сплошной линией по всем точкам: у молчавшего десять часов
// выходила уверенная линия через город между утренней точкой и текущей.
// Правило разрыва берётся из `mapLayersTrack` — одно на обе карты, иначе
// один и тот же день выглядел бы на них по-разному.
// ══════════════════════════════════════════════════════════════════════

export const SOURCE_PEOPLE = 'field-people';
export const LAYER_PEOPLE_TRACK = 'field-people-track';
export const LAYER_PEOPLE_GAP = 'field-people-gap';
export const LAYER_PEOPLE_DOT = 'field-people-dot';
export const LAYER_PEOPLE_NAME = 'field-people-name';

/**
 * Дольше этого молчания точка перестаёт быть «сейчас».
 *
 * То же число, по которому сторож считает трансляцию прерванной, а
 * арифметика дня — разрывом связи: вопрос один, и своей копии здесь быть
 * не должно. Карта, на которой человек ещё «сейчас», и сообщение, где он
 * уже «молчит», — это разъехавшиеся числа, а не два мнения.
 */
export const PEOPLE_STALE_MIN = SILENT_MIN;

export function buildPeopleLayers(c: TokenColors) {
  const live = ['<=', ['get', 'silentMin'], PEOPLE_STALE_MIN];
  return [
    {
      // Путь с начала смены — тонкой линией под точками клиентов по цвету,
      // но своим цветом: это не объезд и не доставка.
      id: LAYER_PEOPLE_TRACK,
      type: 'line' as const,
      source: SOURCE_PEOPLE,
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['!', ['get', 'gap']]],
      layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
      paint: { 'line-color': c.accent, 'line-width': 2, 'line-opacity': 0.55 },
    },
    {
      // Разрыв связи — серым пунктиром, как на карте дня. Это «мы не
      // знаем», а не «он срезал»: сплошная линия здесь утверждала бы, что
      // человек ехал там, где телефон просто молчал.
      id: LAYER_PEOPLE_GAP,
      type: 'line' as const,
      source: SOURCE_PEOPLE,
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['get', 'gap']],
      layout: { 'line-cap': 'butt' as const, 'line-join': 'round' as const },
      paint: {
        'line-color': c.muted,
        'line-width': 2,
        'line-opacity': 0.45,
        'line-dasharray': [1, 2],
      },
    },
    {
      // Сам человек. Кольцо, а не заливка: место и человек не должны
      // выглядеть одинаково.
      id: LAYER_PEOPLE_DOT,
      type: 'circle' as const,
      source: SOURCE_PEOPLE,
      filter: ['==', ['get', 'kind'], 'person'],
      paint: {
        'circle-color': c.card,
        'circle-radius': 9,
        'circle-stroke-width': 4,
        'circle-stroke-color': ['case', live, c.accent, c.muted],
      },
    },
    {
      // Имя ВСЕГДА видно. Человек без имени на карте — это «кто-то там»,
      // а решение принимают про конкретного: «Азиз рядом, отправлю его».
      id: LAYER_PEOPLE_NAME,
      type: 'symbol' as const,
      source: SOURCE_PEOPLE,
      filter: ['==', ['get', 'kind'], 'person'],
      layout: {
        'text-field': ['get', 'name'],
        // Стек назван явно: умолчательный уходит в 404 на нашем хосте.
        'text-font': MAP_FONT,
        'text-size': 11,
        'text-offset': [0, 1.4],
        'text-anchor': 'top' as const,
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': ['case', live, c.text, c.muted],
        'text-halo-color': c.card,
        'text-halo-width': 1.5,
      },
    },
  ];
}

export interface PersonOnMap {
  id: string;
  name: string;
  silentMin: number | null;
  last: { latitude: number; longitude: number } | null;
  /**
   * Путь с начала смены. `at` обязателен: без времени нельзя отличить
   * «ехал» от «молчал», и линия снова стала бы сплошной через весь город.
   */
  track: TrackPoint[];
}

/**
 * GeoJSON людей: путь линией и текущая точка с именем.
 *
 * Человек без последней точки на карту не попадает: рисовать его негде, а
 * выдумывать место нельзя — это тот же принцип, что у стоянки без пина.
 */
export function buildPeopleCollection(people: PersonOnMap[]) {
  const features: GeoJSON.Feature[] = [];

  for (const person of people) {
    // Нет текущей точки — не рисуем ВООБЩЕ, включая путь. Линия без
    // человека на конце читается как «он всё ещё едет», хотя на самом
    // деле мы просто не знаем, где он.
    if (!person.last) continue;

    features.push(...trackSegments(person.track, { kind: 'track', name: person.name }));

    features.push({
      type: 'Feature',
      properties: {
        kind: 'person',
        name: person.name,
        // Молчание в свойствах, а не в цвете на клиенте: правило «через
        // сколько точка гаснет» должно быть одно и жить рядом со слоем.
        silentMin: person.silentMin ?? 9999,
      },
      geometry: { type: 'Point', coordinates: [person.last.longitude, person.last.latitude] },
    });
  }

  return { type: 'FeatureCollection' as const, features };
}
