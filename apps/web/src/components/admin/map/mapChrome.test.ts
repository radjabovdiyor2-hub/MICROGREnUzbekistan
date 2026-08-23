import { describe, it, expect } from 'vitest';

import { activeFilterCount, chipStyle, type FilterState } from './mapChrome';

// ══════════════════════════════════════════════════════════════════════
// Счётчик активных фильтров.
//
// Он единственный признак того, что под свёрнутой лентой что-то включено.
// Ошибётся в меньшую сторону — и карта необъяснимо пуста, а человек ищет
// поломку там, где её нет.
// ══════════════════════════════════════════════════════════════════════

const NONE: FilterState = {
  typeFilter: 'all',
  cityFilter: 'all',
  companyTypes: new Set(),
  audience: 'all',
  district: null,
  showProspects: false,
  showDelivery: false,
  showHeat: false,
};

describe('activeFilterCount', () => {
  it('ничего не выбрано — ноль, и значок не показывается', () => {
    expect(activeFilterCount(NONE)).toBe(0);
  });

  // 'all' — это «не фильтровать», а не шестнадцатое значение фильтра.
  it('«все» в любой ленте за фильтр не считается', () => {
    expect(activeFilterCount({ ...NONE, typeFilter: 'all', cityFilter: 'all' })).toBe(0);
  });

  it('каждая одиночная лента добавляет единицу', () => {
    expect(activeFilterCount({ ...NONE, typeFilter: 'b2b' })).toBe(1);
    expect(activeFilterCount({ ...NONE, cityFilter: 'samarkand' })).toBe(1);
    expect(activeFilterCount({ ...NONE, audience: 'female' })).toBe(1);
    expect(activeFilterCount({ ...NONE, district: 'registon' })).toBe(1);
  });

  // Типы заведений — набор, и выбрать можно несколько сразу. Считать их
  // за одну «ленту» значило бы скрыть, что выбрано три типа из пятнадцати.
  it('типы заведений считаются поштучно, а не лентой', () => {
    expect(activeFilterCount({ ...NONE, companyTypes: new Set(['restaurant']) })).toBe(1);
    expect(
      activeFilterCount({ ...NONE, companyTypes: new Set(['restaurant', 'cafe', 'chaikhana']) }),
    ).toBe(3);
  });

  it('слои поверх карты считаются наравне: для человека это тоже «включено»', () => {
    expect(activeFilterCount({ ...NONE, showProspects: true })).toBe(1);
    expect(activeFilterCount({ ...NONE, showDelivery: true })).toBe(1);
    expect(activeFilterCount({ ...NONE, showHeat: true })).toBe(1);
  });

  it('складывается по всем лентам разом', () => {
    expect(
      activeFilterCount({
        typeFilter: 'b2b',
        cityFilter: 'samarkand',
        companyTypes: new Set(['restaurant', 'cafe']),
        audience: 'female',
        district: 'registon',
        showProspects: true,
        showDelivery: true,
        showHeat: true,
      }),
    ).toBe(9);
  });
});

describe('chipStyle', () => {
  // Цвета только токенами: захардкоженный hex ушёл бы мимо дизайн-системы
  // и не следовал бы за темой.
  it('красится переменными, а не значениями', () => {
    for (const style of [chipStyle(true), chipStyle(false)]) {
      for (const value of Object.values(style)) {
        if (typeof value !== 'string') continue;
        expect(value).not.toMatch(/#[0-9a-f]{3,8}\b/i);
        expect(value).not.toMatch(/\brgb\(/);
      }
    }
  });

  it('выбранный чип отличается от невыбранного, а не только рамкой', () => {
    expect(chipStyle(true).background).not.toBe(chipStyle(false).background);
    expect(chipStyle(true).color).not.toBe(chipStyle(false).color);
  });
});
