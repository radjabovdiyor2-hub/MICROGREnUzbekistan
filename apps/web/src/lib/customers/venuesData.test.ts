import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { AUDIENCES, COMPANY_TYPES } from './companyTypes';
import { CITY_SLUGS } from './districts';
import { normalizeCity } from './addressKey';

// ══════════════════════════════════════════════════════════════════════
// Выгрузка справочника заведений — данные, а не код.
//
// Файл собран из открытых каталогов и правится руками, поэтому проверяется
// тем же тестом, что и таблицы: опечатка в типе («bakerу» кириллицей,
// «restourant») не падает нигде — карточка просто заводится с типом,
// которого нет в справочнике, и не попадает ни под один фильтр.
//
// 20.08.2026 такая карточка уронила выкатку по-настоящему, но по другой
// причине: в живой базе с прежних времён остался CHECK на шесть типов, а
// 'bakery' в него не входил. Ограничение снято (unify_databases.sql, шаг 5),
// и единственной защитой значений остался справочник в коде — вот она.
// ══════════════════════════════════════════════════════════════════════

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(HERE, '../../../../../content/venues-samarkand.json');

interface Venue {
  company_name: string;
  company_type: string;
  city: string;
  address: string | null;
  audience: string | null;
  audience_source: string | null;
  source: string;
  source_ref: string;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
}

const venues: Venue[] = JSON.parse(readFileSync(DATA, 'utf-8'));

describe('выгрузка заведений Самарканда', () => {
  it('файл не пуст', () => {
    expect(venues.length).toBeGreaterThan(200);
  });

  it('каждый тип заведения известен справочнику', () => {
    for (const v of venues) {
      expect(
        Object.hasOwn(COMPANY_TYPES, v.company_type),
        `«${v.company_name}»: тип «${v.company_type}» отсутствует в COMPANY_TYPES — ` +
          'карточка не попадёт ни под один фильтр',
      ).toBe(true);
    }
  });

  it('город каждой карточки попадает в зону обслуживания', () => {
    for (const v of venues) {
      const zone = normalizeCity(v.city);
      expect(zone, `«${v.company_name}»: город «${v.city}» не опознан`).not.toBeNull();
      expect(CITY_SLUGS).toContain(zone as string);
    }
  });

  it('аудитория — только известное значение и только с пометкой источника', () => {
    for (const v of venues) {
      if (v.audience === null) {
        expect(v.audience_source, `«${v.company_name}»`).toBeNull();
        continue;
      }
      expect(AUDIENCES as readonly string[]).toContain(v.audience);
      // Пол зала взят из подписи каталога, а не проверен нами. Пометка
      // 'manual' заморозила бы его навсегда: автоматика ручное не трогает.
      expect(v.audience_source, `«${v.company_name}»`).toBe('guess');
    }
  });

  it('ключ идемпотентности уникален', () => {
    // Совпадение ключа означает, что второй карточкой первая молча
    // перезапишется, и одно из двух заведений пропадёт.
    const keys = venues.map((v) => `${v.source}::${v.source_ref}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('источник назван честно — 2ГИС среди них нет', () => {
    // Данные прочитаны на страницах каталогов. Пометить их как '2gis'
    // значило бы приписать им точность, которой у них нет: ни телефонов,
    // ни координат каталоги не дали.
    const allowed = ['goldenpages', 'top_uz', 'samcity'];
    for (const v of venues) {
      expect(allowed, `«${v.company_name}»`).toContain(v.source);
    }
  });

  it('выдуманных телефонов и координат нет', () => {
    // Каталоги маскируют номера («+998 (91) 528-XX-XX»), а дописать цифры
    // значит выдумать номер. Координаты проставит геокодер по адресу.
    for (const v of venues) {
      expect(v.phone, `«${v.company_name}»`).toBeNull();
      expect(v.latitude, `«${v.company_name}»`).toBeNull();
      expect(v.longitude, `«${v.company_name}»`).toBeNull();
    }
  });

  it('у большинства карточек есть уличный адрес', () => {
    // Без адреса геокодер не поставит точку, и заведение навсегда останется
    // в лотке. Отдельные такие карточки допустимы, массовые — нет.
    const withAddress = venues.filter((v) => v.address).length;
    expect(withAddress / venues.length).toBeGreaterThan(0.8);
  });

  it('названия не повторяются в пределах одного типа', () => {
    // Дедуп при сборке шёл по нормализованному имени. Повтор означает, что
    // он пропустил склейку и в CRM появится два одинаковых заведения.
    const seen = new Set<string>();
    for (const v of venues) {
      const key = `${v.company_type}:${v.company_name.toLowerCase().trim()}`;
      expect(seen.has(key), `дубль: «${v.company_name}» (${v.company_type})`).toBe(false);
      seen.add(key);
    }
  });
});
