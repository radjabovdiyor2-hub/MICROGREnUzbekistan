import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  RETIRED_COMPANY_TYPES,
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

  it('выведенный тип сохраняет подпись, но не возвращается в фильтр', () => {
    // Карточки выведенных типов остаются у тех, за кем есть заказ. Без
    // подписи в списке появилась бы строка «Плов Центр · clinic», а в
    // разрезе по районам — «12 school».
    for (const [slug, meta] of Object.entries(RETIRED_COMPANY_TYPES)) {
      expect(companyTypeLabel(slug, 'ru'), slug).toBe(meta.ru);
      expect(companyTypeLabel(slug, 'uz'), slug).toBe(meta.uz);
      expect(isCompanyType(slug), slug).toBe(false);
      expect(COMPANY_TYPES, slug).not.toHaveProperty(slug);
    }
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

// ══════════════════════════════════════════════════════════════════════
// Сверка со сборщиком офиса.
//
// Таксономия существует ДВАЖДЫ: здесь и в `VENUE_QUERIES` из
// `apps/tgas/shared/lead_gen.py`. Дублирование намеренное (прямых импортов
// между модулями нет, см. CLAUDE.md), но расходится оно молча — и уже
// разошлось: категория «Учебное заведение» жила в обоих списках, ночная
// ротация исправно собирала вузы и колледжи, и владелец находил их в списке
// клиентов и на карте. Убрать её из интерфейса, не тронув Python, значило бы
// продолжать собирать их — только теперь без подписи.
//
// Тест читает lead_gen.py файлом, а не импортирует: это Python и другой
// модуль. Приём тот же, что в `districts.test.ts`.
// ══════════════════════════════════════════════════════════════════════

const HERE = dirname(fileURLToPath(import.meta.url));
const LEAD_GEN_PY = resolve(HERE, '../../../../../apps/tgas/shared/lead_gen.py');

/** Ключи `VENUE_QUERIES` из lead_gen.py — то, что сбор пишет в базу. */
function categoriesCollectedByOffice(): string[] {
  const source = readFileSync(LEAD_GEN_PY, 'utf-8');
  const block = source.match(/VENUE_QUERIES: dict\[str, list\[str\]\] = \{([\s\S]*?)^\}/m);
  if (!block) throw new Error('В lead_gen.py не найден словарь VENUE_QUERIES');
  return [...block[1].matchAll(/^\s{4}"([a-z]+)":/gm)].map((m) => m[1]);
}

describe('сверка со сборщиком офиса', () => {
  it('каждая собираемая категория известна справочнику', () => {
    const collected = categoriesCollectedByOffice();
    expect(collected.length).toBeGreaterThan(10);
    for (const slug of collected) {
      expect(
        isCompanyType(slug),
        `lead_gen.py собирает «${slug}», которого нет в COMPANY_TYPES — ` +
          'заведение ляжет в базу с типом, недоступным ни одному фильтру',
      ).toBe(true);
    }
  });

  it('выведенные типы сбор больше не запрашивает', () => {
    // Иначе они вернутся той же ночной ротацией, ради которой всё и затевалось.
    const collected = new Set(categoriesCollectedByOffice());
    for (const slug of Object.keys(RETIRED_COMPANY_TYPES)) {
      expect(collected.has(slug), `lead_gen.py всё ещё собирает «${slug}»`).toBe(false);
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
