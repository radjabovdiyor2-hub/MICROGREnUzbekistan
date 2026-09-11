import { describe, expect, it } from 'vitest';

import { buildLayers } from './mapLayers';
import {
  LAYER_PEOPLE_DOT,
  LAYER_PEOPLE_NAME,
  LAYER_PEOPLE_GAP,
  LAYER_PEOPLE_TRACK,
  PEOPLE_STALE_MIN,
  buildPeopleCollection,
  buildPeopleLayers,
  type PersonOnMap,
} from './mapLayersPeople';
import type { TokenColors } from './useTokenColors';

const COLORS = {
  success: '#0a0', warning: '#fa0', error: '#a00', info: '#00a', muted: '#999',
  slipping: '#a0a', accent: '#f80', brand: '#0b0', card: '#fff', border: '#ccc',
  text: '#111', rampLow: '#111', rampMid: '#222', rampHigh: '#333',
  cat1: '#1', cat2: '#2', cat3: '#3', cat4: '#4', cat5: '#5', cat7: '#7', cat9: '#9',
} as unknown as TokenColors;

/** Момент через N минут от условного начала смены. */
const minute = (n: number) => new Date(Date.UTC(2026, 8, 11, 9, n)).toISOString();

function person(over: Partial<PersonOnMap> = {}): PersonOnMap {
  return {
    id: 'e1',
    name: 'Азиз',
    silentMin: 2,
    last: { latitude: 39.654, longitude: 66.9597 },
    track: [
      { at: minute(0), latitude: 39.65, longitude: 66.95 },
      { at: minute(1), latitude: 39.654, longitude: 66.9597 },
    ],
    ...over,
  };
}

describe('слой людей', () => {
  it('не спорит именами слоёв с клиентскими', () => {
    // Совпади идентификатор — один слой затёр бы другой молча, и пропали
    // бы либо люди, либо заведения.
    const clientIds = buildLayers('state', COLORS, 0).map((l) => l.id);
    const peopleIds = buildPeopleLayers(COLORS).map((l) => l.id);
    expect(peopleIds).toEqual([
      LAYER_PEOPLE_TRACK, LAYER_PEOPLE_GAP, LAYER_PEOPLE_DOT, LAYER_PEOPLE_NAME,
    ]);
    for (const id of peopleIds) expect(clientIds).not.toContain(id);
  });

  it('человек — кольцо, а не заливка: форма отличает его от места', () => {
    const dot = buildPeopleLayers(COLORS).find((l) => l.id === LAYER_PEOPLE_DOT);
    // Заливка цвета карточки плюс толстая обводка и есть кольцо.
    expect(dot?.paint['circle-color']).toBe(COLORS.card);
    expect(dot?.paint['circle-stroke-width']).toBeGreaterThanOrEqual(3);
  });

  it('имя показывается всегда — решают про конкретного человека', () => {
    const name = buildPeopleLayers(COLORS).find((l) => l.id === LAYER_PEOPLE_NAME);
    expect(name?.layout?.['text-field']).toEqual(['get', 'name']);
    expect(name?.layout?.['text-allow-overlap']).toBe(true);
  });

  it('потерявший связь гаснет до серого, а не краснеет', () => {
    // Молчание — это про связь, а не про человека: красным светил бы
    // каждый подвал.
    const dot = buildPeopleLayers(COLORS).find((l) => l.id === LAYER_PEOPLE_DOT);
    const stroke = JSON.stringify(dot?.paint['circle-stroke-color']);
    expect(stroke).toContain(COLORS.muted);
    expect(stroke).not.toContain(COLORS.error);
    expect(stroke).toContain(String(PEOPLE_STALE_MIN));
  });
});

describe('buildPeopleCollection', () => {
  it('даёт путь линией и точку с именем', () => {
    const fc = buildPeopleCollection([person()]);
    expect(fc.features).toHaveLength(2);
    const dot = fc.features.find((f) => f.properties?.kind === 'person');
    expect(dot?.properties?.name).toBe('Азиз');
    expect(dot?.properties?.silentMin).toBe(2);
  });

  it('без последней точки человека не рисуем — место не выдумываем', () => {
    expect(buildPeopleCollection([person({ last: null })]).features).toHaveLength(0);
  });

  it('одна точка трека линией не становится', () => {
    const fc = buildPeopleCollection([
      person({ track: [{ at: minute(0), latitude: 39.6, longitude: 66.9 }] }),
    ]);
    expect(fc.features.filter((f) => f.geometry.type === 'LineString')).toHaveLength(0);
  });

  it('молчание внутри пути рвёт линию, а не рисует дорогу через город', () => {
    // ЭТО БЫЛО СЛОМАНО. Путь рисовался ОДНОЙ сплошной линией по всем
    // точкам: у человека с утренней точкой и текущей выходила уверенная
    // линия через весь город — «он там ехал», хотя телефон просто молчал.
    const fc = buildPeopleCollection([
      person({
        track: [
          { at: minute(0), latitude: 39.65, longitude: 66.90 },
          { at: minute(1), latitude: 39.65, longitude: 66.91 },
          // Полтора часа тишины — и снова точка, уже на другом краю.
          { at: minute(90), latitude: 39.70, longitude: 67.05 },
        ],
      }),
    ]);
    const lines = fc.features.filter((f) => f.geometry.type === 'LineString');
    expect(lines).toHaveLength(2);
    expect(lines.filter((f) => f.properties?.gap === true)).toHaveLength(1);
    expect(lines.filter((f) => f.properties?.gap === false)).toHaveLength(1);
  });

  it('неизвестное молчание считается давним, а не свежим', () => {
    // Иначе человек без единой точки светился бы как «на связи».
    const fc = buildPeopleCollection([person({ silentMin: null })]);
    const dot = fc.features.find((f) => f.properties?.kind === 'person');
    expect(Number(dot?.properties?.silentMin)).toBeGreaterThan(PEOPLE_STALE_MIN);
  });

  it('пустой список — пустая коллекция, а не падение', () => {
    expect(buildPeopleCollection([]).features).toEqual([]);
  });
});
