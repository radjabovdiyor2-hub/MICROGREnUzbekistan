import { describe, expect, it } from 'vitest';

import { metersBetween, proofLabel, visitProof, NEAR_METERS } from './visitProof';

// ══════════════════════════════════════════════════════════════════════
// Подтверждение места у отметки визита.
//
// Проверяются РЕШЕНИЯ, а не арифметика: каждое из них можно сдвинуть на
// строчку и получить либо обвинение честного продавца, либо зелёную галочку
// там, где человек не был.
//
// Главная тонкость — погрешность работает в пользу сотрудника. Телефон,
// сообщивший круг радиусом 200 метров, не даёт права сказать «он был в 200
// метрах»: он даёт право сказать «мог стоять у дверей».
// ══════════════════════════════════════════════════════════════════════

// Регистан и точка примерно в 300 м от него.
const REGISTAN = { latitude: 39.6547, longitude: 66.9758 };

describe('расстояние', () => {
  it('до самого себя — ноль', () => {
    expect(metersBetween(REGISTAN, REGISTAN)).toBe(0);
  });

  it('считается в метрах, а не в километрах', () => {
    // 0.01° широты ≈ 1.11 км.
    const north = { latitude: REGISTAN.latitude + 0.01, longitude: REGISTAN.longitude };
    const m = metersBetween(REGISTAN, north);
    expect(m).toBeGreaterThan(1000);
    expect(m).toBeLessThan(1200);
  });
});

describe('вывод по расстоянию и точности', () => {
  it('у дверей — «рядом»', () => {
    expect(visitProof(40, 10).kind).toBe('near');
  });

  it('другой конец города — «далеко»', () => {
    expect(visitProof(3200, 20).kind).toBe('far');
  });

  it('ровно на границе считается близким', () => {
    expect(visitProof(NEAR_METERS, 0).kind).toBe('near');
    expect(visitProof(NEAR_METERS + 1, 0).kind).toBe('far');
  });

  it('погрешность работает В ПОЛЬЗУ сотрудника', () => {
    // 300 м до клиента, но телефон сам признаёт круг в 200 м: человек мог
    // стоять в сотне метров, то есть у дверей. Обвинять нечем.
    expect(visitProof(300, 200).kind).toBe('near');
    // Тот же километраж при честном GPS — уже «далеко».
    expect(visitProof(300, 10).kind).toBe('far');
  });

  it('никакая точность — отдельный исход, а не «далеко»', () => {
    // Круг радиусом километр не говорит ни о чём. Красить это красным
    // значило бы обвинить по шуму.
    expect(visitProof(900, 1000).kind).toBe('rough');
  });

  it('места нет вовсе — «не подтверждено», а не «далеко»', () => {
    expect(visitProof(null, null).kind).toBe('none');
    expect(visitProof(undefined, 10).kind).toBe('none');
  });

  it('отсутствие точности не мешает выводу', () => {
    // Старые отметки писались без accuracy; они не должны все стать «rough».
    expect(visitProof(40, null).kind).toBe('near');
    expect(visitProof(4000, undefined).kind).toBe('far');
  });
});

describe('подпись', () => {
  it('метры до километра, дальше — километры', () => {
    expect(proofLabel(visitProof(40, 5), 'ru')).toBe('рядом · 40 м');
    expect(proofLabel(visitProof(3200, 5), 'ru')).toBe('далеко · 3.2 км');
  });

  it('без места говорит именно это', () => {
    expect(proofLabel(visitProof(null, null), 'ru')).toBe('место не подтверждено');
  });

  it('узбекская подпись не пустая', () => {
    expect(proofLabel(visitProof(40, 5), 'uz')).toContain('yaqin');
  });
});
