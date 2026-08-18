import { describe, it, expect } from 'vitest';

import { citySpellings, normalizeCity } from './addressKey';

// ══════════════════════════════════════════════════════════════════════
// Один город — один slug, как бы его ни написали.
//
// Это прямое лекарство от расхождения, которое уже живёт в схеме:
// `customers.city` по умолчанию "Samarqand", `orders.city` — "tashkent".
// Пока фильтр карты сравнивает сырую колонку, «показать Ташкент» находит
// лишь часть клиентов, и карта выглядит полупустой без всякой причины.
// ══════════════════════════════════════════════════════════════════════

describe('normalizeCity', () => {
  it('сводит все написания Ташкента к одному slug', () => {
    for (const raw of [
      'tashkent',
      'Tashkent',
      'TASHKENT',
      'Toshkent',
      'toshkent',
      'Ташкент',
      'Тошкент',
      'г. Ташкент',
      'Toshkent sh.',
      'Toshkent shahri',
    ]) {
      expect(normalizeCity(raw), raw).toBe('tashkent');
    }
  });

  it('сводит все написания Самарканда к одному slug', () => {
    for (const raw of [
      'samarkand',
      'Samarqand',
      'SAMARQAND',
      'Самарканд',
      'Самарқанд',
      'г. Самарканд',
    ]) {
      expect(normalizeCity(raw), raw).toBe('samarkand');
    }
  });

  it('дефолты витрины и CRM оказываются одним городом только там, где должны', () => {
    // Ровно та пара, что разошлась в схеме.
    expect(normalizeCity('Samarqand')).toBe('samarkand');
    expect(normalizeCity('tashkent')).toBe('tashkent');
    expect(normalizeCity('Samarqand')).not.toBe(normalizeCity('tashkent'));
  });

  it('узбекские апострофы не мешают узнать город', () => {
    expect(normalizeCity('Toshkent shahri')).toBe('tashkent');
    expect(normalizeCity('Toshkent  shahri ')).toBe('tashkent');
  });

  it('неизвестный город честно даёт null, а не угадывается', () => {
    expect(normalizeCity('Бухара')).toBeNull();
    expect(normalizeCity('Fergana')).toBeNull();
    expect(normalizeCity('')).toBeNull();
    expect(normalizeCity(null)).toBeNull();
    expect(normalizeCity(undefined)).toBeNull();
    expect(normalizeCity('   ')).toBeNull();
  });
});

describe('citySpellings', () => {
  it('перечисляет написания для фильтра по сырой колонке', () => {
    const tashkent = citySpellings('tashkent');
    expect(tashkent).toContain('tashkent');
    expect(tashkent).toContain('toshkent');
    expect(tashkent).toContain('ташкент');
  });

  it('не смешивает города между собой', () => {
    const overlap = citySpellings('tashkent').filter((s) =>
      citySpellings('samarkand').includes(s),
    );
    expect(overlap).toEqual([]);
  });

  it('каждое перечисленное написание распознаётся обратно', () => {
    for (const slug of ['tashkent', 'samarkand'] as const) {
      for (const spelling of citySpellings(slug)) {
        expect(normalizeCity(spelling), spelling).toBe(slug);
      }
    }
  });
});
