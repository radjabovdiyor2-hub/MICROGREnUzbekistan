import { SILENT_MIN } from '@/lib/tracking/ping';

import { MAP_FONT } from './mapFont';
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
// ══════════════════════════════════════════════════════════════════════

export const SOURCE_PEOPLE = 'field-people';
export const LAYER_PEOPLE_TRACK = 'field-people-track';
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
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
      paint: { 'line-color': c.accent, 'line-width': 2, 'line-opacity': 0.55 },
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
  track: { latitude: number; longitude: number }[];
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

    if (person.track.length > 1) {
      features.push({
        type: 'Feature',
        properties: { kind: 'track', name: person.name },
        geometry: {
          type: 'LineString',
          coordinates: person.track.map((p) => [p.longitude, p.latitude]),
        },
      });
    }

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
