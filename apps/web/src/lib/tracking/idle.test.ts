import { describe, expect, it } from 'vitest';

import { detectIdle, idleTotalSec } from './idle';
import type { TrackPingInput } from './ping';

// «Стоит на месте» и «связи нет» — разные состояния, и весь смысл этого
// модуля в том, чтобы они не путались. Первое — вопрос к человеку, второе
// чаще к телефону, и спросить не о том хуже, чем не спросить вовсе.

const BASE = new Date('2026-09-11T09:00:00').getTime();
const LAT = 39.65;
const LON = 66.96;

/** Крошка через `min` минут после начала, со смещением в градусах. */
function ping(min: number, dLat = 0, dLon = 0): TrackPingInput {
  return {
    at: new Date(BASE + min * 60_000),
    latitude: LAT + dLat,
    longitude: LON + dLon,
    accuracyM: 10,
    source: 'telegram_live',
    speedMps: null,
    headingDeg: null,
  };
}

/** Крошки раз в минуту на одном месте. */
function standing(from: number, to: number, jitter = 0): TrackPingInput[] {
  const out: TrackPingInput[] = [];
  for (let m = from; m <= to; m += 1) {
    // Дрожь приёмника: знак чередуется, чтобы точка «дышала» вокруг места.
    const d = jitter * (m % 2 === 0 ? 1 : -1);
    out.push(ping(m, d, d));
  }
  return out;
}

const RADIUS_M = 150;
const HALF_HOUR = 30 * 60 * 1000;

describe('detectIdle', () => {
  it('сорок минут на одном месте — это простой', () => {
    const windows = detectIdle(standing(0, 40), RADIUS_M, HALF_HOUR);

    expect(windows).toHaveLength(1);
    expect(windows[0].idleSec).toBe(40 * 60);
    expect(windows[0].pings).toBe(41);
  });

  it('дрожь приёмника не рвёт окно на десяток коротких', () => {
    // ±0.0002° ≈ ±22 м: обычный разброс городского GPS. Считай мы
    // расстояние до предыдущей крошки, каждое такое дрожание выглядело бы
    // движением.
    const windows = detectIdle(standing(0, 40, 0.0002), RADIUS_M, HALF_HOUR);

    expect(windows).toHaveLength(1);
    expect(windows[0].idleSec).toBe(40 * 60);
  });

  it('медленный уход шагом простоем не становится', () => {
    // Пятьдесят метров в минуту: соседние крошки всегда «рядом», а за сорок
    // минут человек уходит на два километра. Якорь, ползущий за человеком,
    // назвал бы эту прогулку стоянием на месте — поэтому он неподвижен.
    const track = Array.from({ length: 41 }, (_, i) => ping(i, i * 0.00045, 0));

    expect(detectIdle(track, RADIUS_M, HALF_HOUR)).toEqual([]);
  });

  it('поездка простоем не считается', () => {
    // Каждую минуту на километр в сторону — человек едет.
    const track = Array.from({ length: 40 }, (_, i) => ping(i, i * 0.01, 0));

    expect(detectIdle(track, RADIUS_M, HALF_HOUR)).toEqual([]);
  });

  it('короткая остановка — это очередь и светофор, а не простой', () => {
    expect(detectIdle(standing(0, 12), RADIUS_M, HALF_HOUR)).toEqual([]);
  });

  it('молчание связи простоем НЕ становится', () => {
    // Пять точек на одном месте за два часа — по получасу между ними.
    // Крошек хватает, место одно, времени с избытком; и всё же это не
    // простой: в каждую из этих дыр человек мог уехать и вернуться.
    const track = [ping(0), ping(30), ping(60), ping(90), ping(120)];

    expect(detectIdle(track, RADIUS_M, HALF_HOUR)).toEqual([]);
  });

  it('разрыв связи заканчивает окно, а не продлевает его', () => {
    // Стоял 40 минут, связь пропала на час, потом стоял ещё 40 — это два
    // окна по 40 минут, а не одно на два часа двадцать.
    const track = [
      ...standing(0, 40),
      ...standing(100, 140),
    ];

    const windows = detectIdle(track, RADIUS_M, HALF_HOUR);
    expect(windows).toHaveLength(2);
    expect(idleTotalSec(windows)).toBe(80 * 60);
  });

  it('полчаса у клиента — это работа, а не бездействие', () => {
    const track = standing(0, 40);
    const busy = [
      { arrivedAt: new Date(BASE + 5 * 60_000), leftAt: new Date(BASE + 35 * 60_000) },
    ];

    expect(detectIdle(track, RADIUS_M, HALF_HOUR, { busy })).toEqual([]);
  });

  it('стоял у пина клиента — это заезд, а не простой', () => {
    // Заезда в базе ещё нет: сторож смотрит на текущий час, пересчитывать
    // стоянки некому. Пин клиента рядом — и этого достаточно, чтобы не
    // спрашивать человека, почему он бездельничает у своего же клиента.
    const pins = [{ id: 7, latitude: LAT + 0.0003, longitude: LON }];

    expect(detectIdle(standing(0, 40), RADIUS_M, HALF_HOUR, { pins })).toEqual([]);
  });

  it('пин клиента за квартал простой не отменяет', () => {
    const pins = [{ id: 7, latitude: LAT + 0.01, longitude: LON }];

    expect(detectIdle(standing(0, 40), RADIUS_M, HALF_HOUR, { pins })).toHaveLength(1);
  });

  it('стоянка у клиента в другое время простой не отменяет', () => {
    const track = standing(0, 40);
    const busy = [
      { arrivedAt: new Date(BASE + 120 * 60_000), leftAt: new Date(BASE + 150 * 60_000) },
    ];

    expect(detectIdle(track, RADIUS_M, HALF_HOUR, { busy })).toHaveLength(1);
  });

  it('три точки на полчаса доказательством не считаются', () => {
    // Формально всё сходится: якорь один, дыры в пятнадцать минут порога
    // не превышают, полчаса набралось. Но три крошки на тридцать минут —
    // это редкая связь, а не доказательство, что человек стоял.
    const track = [ping(0), ping(15), ping(30)];

    expect(detectIdle(track, RADIUS_M, HALF_HOUR)).toEqual([]);
  });

  it('пустой трек — пустой список, а не падение', () => {
    expect(detectIdle([], RADIUS_M, HALF_HOUR)).toEqual([]);
    expect(idleTotalSec([])).toBe(0);
  });

  it('место простоя — точка входа, а не выдуманное среднее', () => {
    const windows = detectIdle(standing(0, 40), RADIUS_M, HALF_HOUR);

    expect(windows[0].latitude).toBe(LAT);
    expect(windows[0].longitude).toBe(LON);
  });
});
