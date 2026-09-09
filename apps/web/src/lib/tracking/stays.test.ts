import { describe, expect, it } from 'vitest';

import { STAY_BREAK_MS, detectLegs, detectStays, nearestPin, type CustomerPin } from './stays';
import type { TrackPingInput } from './ping';

// Три заведения в Самарканде. PLOV и CHAY стоят в 60 метрах друг от друга —
// так и бывает в центре, и именно на этой паре проверяется, что визит не
// приписывается соседу по улице.
const PLOV: CustomerPin = { id: 1, latitude: 39.654, longitude: 66.9597 };
const CHAY: CustomerPin = { id: 2, latitude: 39.654, longitude: 66.96040 };
const FAR: CustomerPin = { id: 3, latitude: 39.68, longitude: 67.01 };
const PINS = [PLOV, CHAY, FAR];

const T0 = new Date('2026-09-09T09:00:00').getTime();
const RADIUS = 150;
const MIN_STAY = 5 * 60 * 1000;

/** Крошка у заданной точки со сдвигом на `metersEast` и через `min` минут. */
function at(pin: CustomerPin, min: number, metersEast = 0): TrackPingInput {
  return {
    at: new Date(T0 + min * 60_000),
    latitude: pin.latitude,
    longitude: pin.longitude + metersEast / 86_000,
    accuracyM: 10,
    source: 'telegram_live',
    speedMps: null,
    headingDeg: null,
  };
}

describe('nearestPin', () => {
  it('выбирает ближайшего, а не первого в радиусе', () => {
    // Точка в 10 метрах от CHAY и в 50 от PLOV — оба в радиусе 150.
    const near = { latitude: CHAY.latitude, longitude: CHAY.longitude + 10 / 86_000 };
    expect(nearestPin(near, PINS, RADIUS)?.id).toBe(CHAY.id);
  });

  it('вне радиуса — никого', () => {
    expect(nearestPin({ latitude: 39.7, longitude: 67.2 }, PINS, RADIUS)).toBeNull();
  });
});

describe('detectStays', () => {
  it('находит стоянку и считает длительность', () => {
    const stays = detectStays(
      [at(PLOV, 0), at(PLOV, 5, 10), at(PLOV, 12, 5), at(FAR, 30)],
      PINS,
      RADIUS,
      MIN_STAY,
    );
    expect(stays).toHaveLength(1);
    expect(stays[0].customerId).toBe(PLOV.id);
    expect(stays[0].dwellSec).toBe(12 * 60);
    expect(stays[0].pings).toBe(3);
  });

  it('проезд мимо не становится визитом', () => {
    // Две крошки с разницей в минуту — это светофор, а не заезд.
    const stays = detectStays([at(PLOV, 0), at(PLOV, 1)], PINS, RADIUS, MIN_STAY);
    expect(stays).toEqual([]);
  });

  it('соседнее заведение не забирает себе визит', () => {
    const stays = detectStays(
      [at(CHAY, 0), at(CHAY, 6), at(CHAY, 15)],
      PINS,
      RADIUS,
      MIN_STAY,
    );
    expect(stays).toHaveLength(1);
    expect(stays[0].customerId).toBe(CHAY.id);
  });

  it('две стоянки подряд у разных клиентов не сливаются', () => {
    const stays = detectStays(
      [at(PLOV, 0), at(PLOV, 10), at(FAR, 40), at(FAR, 55)],
      PINS,
      RADIUS,
      MIN_STAY,
    );
    expect(stays.map((s) => s.customerId)).toEqual([PLOV.id, FAR.id]);
  });

  it('короткое молчание внутри стоянки её не разрезает', () => {
    // Двадцать минут без связи у одного клиента — это подвал, а не отъезд.
    // Разрезать здесь значило бы показать два коротких заезда вместо
    // одного долгого разговора, то есть занизить работу по шуму связи.
    const stays = detectStays([at(PLOV, 0), at(PLOV, 20), at(PLOV, 25)], PINS, RADIUS, MIN_STAY);
    expect(stays).toHaveLength(1);
    expect(stays[0].dwellSec).toBe(25 * 60);
    expect(stays[0].silentSec).toBe(20 * 60);
  });

  it('молчание дольше часа разрезает: за час уезжают и возвращаются', () => {
    const breakMin = STAY_BREAK_MS / 60_000;
    const stays = detectStays(
      [at(PLOV, 0), at(PLOV, 10), at(PLOV, 10 + breakMin + 5), at(PLOV, 10 + breakMin + 20)],
      PINS,
      RADIUS,
      MIN_STAY,
    );
    expect(stays).toHaveLength(2);
  });

  it('выезд из радиуса закрывает стоянку по последней точке у клиента', () => {
    const stays = detectStays(
      [at(PLOV, 0), at(PLOV, 8), at(FAR, 9)],
      PINS,
      RADIUS,
      MIN_STAY,
    );
    expect(stays[0].leftAt.getTime()).toBe(T0 + 8 * 60_000);
  });

  it('без пинов и без крошек ничего не выдумывает', () => {
    expect(detectStays([at(PLOV, 0), at(PLOV, 10)], [], RADIUS, MIN_STAY)).toEqual([]);
    expect(detectStays([], PINS, RADIUS, MIN_STAY)).toEqual([]);
  });
});

describe('detectLegs', () => {
  it('строит плечо между соседними стоянками', () => {
    const stays = detectStays(
      [at(PLOV, 0), at(PLOV, 10), at(FAR, 40), at(FAR, 55)],
      PINS,
      RADIUS,
      MIN_STAY,
    );
    const legs = detectLegs(stays);
    expect(legs).toHaveLength(1);
    // Выехал на 10-й минуте, приехал на 40-й — тридцать минут дороги.
    expect(legs[0].actualSec).toBe(30 * 60);
  });

  it('одна стоянка — плеч нет', () => {
    const stays = detectStays([at(PLOV, 0), at(PLOV, 10)], PINS, RADIUS, MIN_STAY);
    expect(detectLegs(stays)).toEqual([]);
  });
});
