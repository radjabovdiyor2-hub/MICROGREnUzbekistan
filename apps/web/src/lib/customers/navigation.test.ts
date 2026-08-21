import { describe, it, expect } from 'vitest';

import {
  DEFAULT_NAV_APP,
  NAV_APPS,
  buildMultiStopUrl,
  navApp,
} from './navigation';

// ══════════════════════════════════════════════════════════════════════
// Ссылки в навигаторы.
//
// Проверяется не «строка построилась», а то, что ломается молча: неверный
// порядок координат уводит маршрут в другую страну, десятичная запятая
// разрывает пару «широта,долгота», а схема приложения без запасного пути
// оставляет человека перед пустым экраном.
// ══════════════════════════════════════════════════════════════════════

// Самарканд, площадь Регистан.
const LAT = 39.654722;
const LON = 66.975833;

describe('таблица навигаторов', () => {
  it('у каждого есть обе подписи и уникальный id', () => {
    const ids = NAV_APPS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const app of NAV_APPS) {
      expect(app.ru, app.id).toBeTruthy();
      expect(app.uz, app.id).toBeTruthy();
    }
  });

  it('по умолчанию — Яндекс Навигатор: в Узбекистане он основной', () => {
    expect(DEFAULT_NAV_APP).toBe('yandexnavi');
    expect(navApp(null).id).toBe('yandexnavi');
    expect(navApp('выдумка').id).toBe('yandexnavi');
    expect(navApp('2gis').id).toBe('2gis');
  });

  it('схема приложения обязана иметь запасной путь, https — нет', () => {
    // Без приложения `yandexnavi://` не делает НИЧЕГО: ни перехода, ни
    // ошибки. https-ссылка сама откроет сайт, ей запасной путь не нужен.
    for (const app of NAV_APPS) {
      const link = app.url(LAT, LON);
      if (link.startsWith('https://')) continue;
      expect(app.fallbackUrl, `${app.id}: схема без запасного пути`).toBeTypeOf('function');
      expect(app.fallbackUrl!(LAT, LON)).toMatch(/^https:\/\//);
    }
  });
});

describe('координаты в ссылке', () => {
  it('точка, а не запятая — иначе пара «широта,долгота» разваливается', () => {
    // `String(39.65)` в ru-локали не ломается, но Intl и toLocaleString —
    // ломаются, и подмена была бы незаметной: навигатор просто поехал бы
    // в другое место.
    for (const app of NAV_APPS) {
      const link = app.url(LAT, LON);
      expect(link, app.id).toContain('39.654722');
      expect(link, app.id).toContain('66.975833');
    }
  });

  it('у Яндекса широта первой, у 2ГИС — долгота', () => {
    // Самая дорогая ошибка в геоссылках: перепутанный порядок уносит точку
    // из Самарканда в Индийский океан, и никакой ошибки при этом нет.
    expect(navApp('yandexmaps').url(LAT, LON)).toContain('rtext=~39.654722,66.975833');
    expect(navApp('2gis').url(LAT, LON)).toContain('/to/66.975833,39.654722');
  });

  it('Google получает пару и режим авто', () => {
    const link = navApp('google').url(LAT, LON);
    expect(link).toContain('destination=39.654722,66.975833');
    expect(link).toContain('travelmode=driving');
  });
});

describe('объезд из нескольких точек', () => {
  const stops = [
    { latitude: 39.65, longitude: 66.97 },
    { latitude: 39.66, longitude: 66.98 },
    { latitude: 39.67, longitude: 66.99 },
  ];

  it('Яндекс получает все точки по порядку', () => {
    const link = buildMultiStopUrl('yandexnavi', stops)!;
    expect(link).toContain('39.650000,66.970000~39.660000,66.980000~39.670000,66.990000');
  });

  it('у Google последняя точка — цель, остальные промежуточные', () => {
    const link = buildMultiStopUrl('google', stops)!;
    expect(link).toContain('destination=39.670000,66.990000');
    expect(link).toContain('waypoints=39.650000%2C66.970000%7C39.660000%2C66.980000');
  });

  it('2ГИС объезд не умеет и честно отвечает «нет»', () => {
    // Подсунуть ему конечную точку вместо объезда значило бы соврать: курьер
    // поехал бы к последнему адресу мимо всех остальных.
    expect(buildMultiStopUrl('2gis', stops)).toBeNull();
  });

  it('пустой список — не ссылка', () => {
    expect(buildMultiStopUrl('yandexnavi', [])).toBeNull();
  });

  it('одна точка — обычный маршрут, а не вырожденный объезд', () => {
    const link = buildMultiStopUrl('google', [stops[0]])!;
    expect(link).toContain('destination=39.650000,66.970000');
    expect(link).not.toContain('waypoints=');
  });
});
