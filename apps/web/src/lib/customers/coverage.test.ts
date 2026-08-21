import { describe, it, expect } from 'vitest';

import { computeCoverage, coverageAdvice, gradeOf, type CoverageRow } from './coverage';

// ══════════════════════════════════════════════════════════════════════
// Готовность карты к поездке.
//
// Главное здесь — что «примерно» не считается готовым. Точка с точностью
// «район» стоит в центре тумана и выглядит так же уверенно, как точка у
// дверей: посчитать её готовой значит отправить курьера на пустырь и
// закрыть вопрос, который открыт.
// ══════════════════════════════════════════════════════════════════════

function row(over: Partial<CoverageRow> = {}): CoverageRow {
  return {
    latitude: 39.65,
    longitude: 66.97,
    geoSource: '2gis',
    geoPrecision: 'exact',
    ...over,
  };
}

describe('оценка одной точки', () => {
  it('дом от провайдера и пин от человека одинаково годны', () => {
    expect(gradeOf(row({ geoPrecision: 'exact' }))).toBe('exact');
    expect(gradeOf(row({ geoSource: 'manual', geoPrecision: 'exact' }))).toBe('exact');
  });

  it('ручной пин годен, даже если точность не проставлена', () => {
    // Пин помечен `geoSource`, а не `geoPrecision`. Проверять только
    // второе значило бы записать работу человека в «примерные».
    expect(gradeOf(row({ geoSource: 'manual', geoPrecision: null }))).toBe('exact');
  });

  it('улица, район и город — это «примерно», а не «готово»', () => {
    for (const precision of ['street', 'district', 'city', null, 'выдумка']) {
      expect(gradeOf(row({ geoPrecision: precision })), String(precision)).toBe('rough');
    }
  });

  it('без координат — отдельная корзина, а не «примерно»', () => {
    expect(gradeOf(row({ latitude: null, longitude: null }))).toBe('missing');
    // Одна координата без второй — это тоже «нет точки»: рисовать её
    // некуда, а считать готовой тем более нельзя.
    expect(gradeOf(row({ latitude: null }))).toBe('missing');
    expect(gradeOf(row({ longitude: null }))).toBe('missing');
  });
});

describe('свод', () => {
  it('считает три корзины и долю готовых', () => {
    const c = computeCoverage([
      row(),
      row({ geoSource: 'manual', geoPrecision: null }),
      row({ geoPrecision: 'street' }),
      row({ latitude: null, longitude: null }),
    ]);
    expect(c).toMatchObject({ exact: 2, rough: 1, missing: 1, total: 4, percent: 50 });
  });

  it('округляет вниз — 99,6 % это ещё не сто', () => {
    // Показать сотню, пока четыре заведения без адреса, значит закрыть
    // вопрос, который открыт.
    const rows = [
      ...Array.from({ length: 996 }, () => row()),
      ...Array.from({ length: 4 }, () => row({ latitude: null, longitude: null })),
    ];
    expect(computeCoverage(rows).percent).toBe(99);
  });

  it('пустая база — ноль процентов, а не деление на ноль', () => {
    expect(computeCoverage([]).percent).toBe(0);
    expect(computeCoverage([]).total).toBe(0);
  });
});

describe('что делать дальше', () => {
  it('сначала зовёт закрыть тех, у кого координат нет вовсе', () => {
    const c = computeCoverage([row({ latitude: null, longitude: null }), row({ geoPrecision: 'street' })]);
    expect(coverageAdvice(c, 'ru')).toContain('геокодер');
  });

  it('когда все размещены — зовёт уточнить примерные', () => {
    const c = computeCoverage([row(), row({ geoPrecision: 'district' })]);
    expect(coverageAdvice(c, 'ru')).toContain('пин');
  });

  it('когда всё точно — говорит именно это, а не молчит', () => {
    // Проценты без следующего шага превращаются в укор.
    expect(coverageAdvice(computeCoverage([row()]), 'ru')).toBe('Все адреса точные');
    expect(coverageAdvice(computeCoverage([]), 'ru')).toBeTruthy();
  });

  it('обе локали отвечают', () => {
    const c = computeCoverage([row({ latitude: null, longitude: null })]);
    expect(coverageAdvice(c, 'uz')).toBeTruthy();
  });
});
