import { describe, it, expect } from 'vitest';

import {
  AUDIENCES,
  AUDIENCE_META,
  AUDIENCE_RELEVANT,
  BUCKET_META,
  COLOR_BUCKETS,
  COMPANY_TYPES,
  COMPANY_TYPE_GROUPS,
  GROUP_META,
  audienceLabel,
  bucketOf,
  bucketPairs,
  companyTypeLabel,
  isAudience,
  isCompanyType,
  typesOfGroup,
} from './companyTypes';

// ══════════════════════════════════════════════════════════════════════
// Справочник типов заведений.
//
// Проверяется не «работает ли функция», а целость таблиц, которые правятся
// руками и расходятся молча: тип без узбекской подписи, тип, не попавший
// ни в одну группу, корзина без цветового токена. Любое из этих
// расхождений даёт не ошибку, а пустое место в интерфейсе — то есть
// фильтр, которого никто не найдёт.
// ══════════════════════════════════════════════════════════════════════

describe('таблица типов заведений', () => {
  it('у каждого типа есть обе подписи и известная группа', () => {
    for (const [slug, meta] of Object.entries(COMPANY_TYPES)) {
      expect(meta.ru, `${slug}.ru`).toBeTruthy();
      expect(meta.uz, `${slug}.uz`).toBeTruthy();
      expect(COMPANY_TYPE_GROUPS, `${slug}.group`).toContain(meta.group);
    }
  });

  it('группы покрывают все типы и ни одна не пуста', () => {
    const covered = COMPANY_TYPE_GROUPS.flatMap((g) => typesOfGroup(g).map((t) => t.slug));
    expect(covered.sort()).toEqual(Object.keys(COMPANY_TYPES).sort());
    for (const group of COMPANY_TYPE_GROUPS) {
      expect(typesOfGroup(group).length, group).toBeGreaterThan(0);
      expect(GROUP_META[group].ru).toBeTruthy();
      expect(GROUP_META[group].uz).toBeTruthy();
    }
  });

  it('категории, где спрашивают пол зала, существуют в справочнике', () => {
    // Опечатка в AUDIENCE_RELEVANT не падает и не видна: лента «женский /
    // мужской» просто никогда не появляется, и признак остаётся пустым
    // навсегда.
    for (const slug of AUDIENCE_RELEVANT) {
      expect(COMPANY_TYPES, slug).toHaveProperty(slug);
    }
  });
});

describe('цветовые корзины', () => {
  it('каждый тип попадает ровно в одну корзину, и все корзины известны', () => {
    const mapped = new Map(bucketPairs());
    expect([...mapped.keys()].sort()).toEqual(Object.keys(COMPANY_TYPES).sort());
    for (const [slug, bucket] of mapped) {
      expect(COLOR_BUCKETS, slug).toContain(bucket);
    }
  });

  it('у каждой корзины есть подписи и токен цвета', () => {
    for (const bucket of COLOR_BUCKETS) {
      expect(BUCKET_META[bucket].ru, bucket).toBeTruthy();
      expect(BUCKET_META[bucket].uz, bucket).toBeTruthy();
      expect(BUCKET_META[bucket].token, bucket).toBeTruthy();
    }
  });

  it('разные корзины не делят один токен — иначе цвет перестаёт различать', () => {
    const tokens = COLOR_BUCKETS.map((b) => BUCKET_META[b].token);
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('неизвестный тип красится как «прочее», а не роняет карту', () => {
    expect(bucketOf('выдумка')).toBe('other');
    expect(bucketOf(null)).toBe('other');
  });
});

describe('подписи', () => {
  it('неизвестный slug показывается как есть, а не пустотой', () => {
    expect(companyTypeLabel('вымысел', 'ru')).toBe('вымысел');
  });

  it('пустой тип — это «не указан», а не пустая строка', () => {
    expect(companyTypeLabel(null, 'ru')).toBe('Тип не указан');
    expect(companyTypeLabel(null, 'uz')).toBeTruthy();
  });

  it('отсутствие аудитории — «не выяснено», а не «смешанный»', () => {
    // Разница рабочая: невыясненное продавец обязан спросить, смешанное —
    // уже спросил. Свести их значило бы закрыть открытый вопрос молча.
    expect(audienceLabel(null, 'ru')).toBe('Не выяснено');
    expect(audienceLabel('mixed', 'ru')).toBe('Смешанный');
  });

  it('у каждой аудитории есть обе подписи', () => {
    for (const slug of AUDIENCES) {
      expect(AUDIENCE_META[slug].ru, slug).toBeTruthy();
      expect(AUDIENCE_META[slug].uz, slug).toBeTruthy();
    }
  });
});

describe('проверка значений фильтра', () => {
  it('пропускает только известное', () => {
    expect(isCompanyType('fitness')).toBe(true);
    expect(isCompanyType('toyxona')).toBe(true);
    expect(isCompanyType('выдумка')).toBe(false);
    expect(isCompanyType(null)).toBe(false);
    // 'unknown' — это НЕ аудитория, а отдельный режим фильтра «пол зала не
    // выяснен». Проскочи он сюда как значение, в базу ушло бы
    // `audience = 'unknown'` вместо `audience IS NULL`.
    expect(isAudience('unknown')).toBe(false);
    expect(isAudience('female')).toBe(true);
  });

  it('не путает наследуемые свойства Object с типами заведений', () => {
    // `value in COMPANY_TYPES` без этой проверки отвечает true на
    // 'constructor' и 'toString', и фильтр уходил бы в базу с мусором.
    expect(isCompanyType('constructor')).toBe(false);
    expect(isCompanyType('toString')).toBe(false);
  });
});
