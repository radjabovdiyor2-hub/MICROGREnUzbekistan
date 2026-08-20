import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { CITY_SLUGS, DISTRICTS, districtLabel, districtsOfCity } from './districts';
import { citySpellings, normalizeCity } from './addressKey';

// ══════════════════════════════════════════════════════════════════════
// Районы и города.
//
// Главное здесь — последний блок: список районов существует ДВАЖДЫ, тут и
// в `apps/tgas/shared/geo.py::_DISTRICTS`. Дублирование намеренное (прямых
// импортов между модулями нет, см. CLAUDE.md), но расходится оно молча:
// геокодер запишет в базу slug, которого интерфейс не знает, и владелец
// увидит в разрезе строку «kattaqorgon» вместо «Каттакурган». Ошибка в
// районе тише ошибки в координате и потому опаснее — неверный пин видно
// на карте сразу.
//
// Тест читает geo.py файлом, а не импортирует: это Python и другой модуль.
// ══════════════════════════════════════════════════════════════════════

const HERE = dirname(fileURLToPath(import.meta.url));
const GEO_PY = resolve(HERE, '../../../../../apps/tgas/shared/geo.py');

/** Значения `_DISTRICTS` из geo.py — то, что геокодер пишет в базу. */
function slugsWrittenByGeocoder(): string[] {
  const source = readFileSync(GEO_PY, 'utf-8');
  const block = source.match(/_DISTRICTS = \{([\s\S]*?)\n\}/);
  if (!block) throw new Error('В geo.py не найден словарь _DISTRICTS');
  return [...block[1].matchAll(/:\s*"([a-z-]+)"/g)].map((m) => m[1]);
}

describe('таблица районов', () => {
  it('каждый район привязан к известному городу', () => {
    for (const [slug, meta] of Object.entries(DISTRICTS)) {
      expect(CITY_SLUGS, slug).toContain(meta.city);
      expect(meta.ru, `${slug}.ru`).toBeTruthy();
      expect(meta.uz, `${slug}.uz`).toBeTruthy();
      expect(['city', 'region'], `${slug}.scope`).toContain(meta.scope);
    }
  });

  it('город идёт перед областью — сначала два тумана Самарканда', () => {
    const list = districtsOfCity('samarkand');
    const firstRegion = list.findIndex((d) => d.meta.scope === 'region');
    const lastCity = list.map((d) => d.meta.scope).lastIndexOf('city');
    expect(lastCity).toBeLessThan(firstRegion);
    expect(list.slice(0, 2).map((d) => d.slug).sort()).toEqual(['siyob', 'temiryol']);
  });

  it('область заведена целиком — четырнадцать туманов плюс два городских', () => {
    // Число, а не «больше нуля»: пропущенный туман не падает, он просто
    // оставляет заведения этого района без подписи навсегда.
    expect(districtsOfCity('samarkand')).toHaveLength(16);
  });

  it('неизвестный slug не превращается в undefined посреди разметки', () => {
    expect(districtLabel('выдумка', 'ru')).toBe('выдумка');
    expect(districtLabel('toString', 'ru')).toBe('toString');
    expect(districtLabel(null, 'ru')).toBe('Район не определён');
  });
});

describe('город как зона обслуживания', () => {
  it('районные центры области сводятся к Самарканду', () => {
    // Иначе заведение с city='Urgut' выпадает из фильтра «Самарканд» и не
    // показывается вообще ни под одним фильтром, кроме «Все города».
    for (const raw of ['Urgut', 'ургут', 'Kattaqoʻrgʻon', 'Каттакурган', 'Jomboy']) {
      expect(normalizeCity(raw), raw).toBe('samarkand');
    }
  });

  it('«Urgut tumani» — тот же Ургут, что и «Urgut»', () => {
    expect(normalizeCity('Urgut tumani')).toBe('samarkand');
    expect(normalizeCity('Ургут район')).toBe('samarkand');
  });

  it('Ташкент не утёк в самаркандскую зону', () => {
    expect(normalizeCity('Toshkent')).toBe('tashkent');
    expect(citySpellings('tashkent')).not.toContain('urgut');
  });

  it('неизвестное написание честно отвечает «не знаю»', () => {
    expect(normalizeCity('Бухара')).toBeNull();
    expect(normalizeCity('')).toBeNull();
  });
});

describe('сверка с геокодером офиса', () => {
  it('каждый slug из geo.py знаком интерфейсу', () => {
    const written = slugsWrittenByGeocoder();
    expect(written.length).toBeGreaterThan(20);
    for (const slug of new Set(written)) {
      expect(
        Object.hasOwn(DISTRICTS, slug),
        `geo.py пишет в базу район «${slug}», которого нет в districts.ts — ` +
          'в разрезе по районам он покажется сырым слагом',
      ).toBe(true);
    }
  });

  it('туманы области, ради которых всё затевалось, знает и геокодер', () => {
    const written = new Set(slugsWrittenByGeocoder());
    for (const slug of ['urgut', 'kattaqorgon', 'jomboy', 'payariq', 'toyloq']) {
      expect(written.has(slug), `geo.py не умеет распознавать «${slug}»`).toBe(true);
    }
  });
});
