import { describe, it, expect } from 'vitest';

import {
  VISIT_CHANNEL,
  VISIT_OUTCOMES,
  VISIT_TYPES,
  isVisitType,
  lastVisitLabel,
  visitOutcome,
} from './visits';

// ══════════════════════════════════════════════════════════════════════
// Визиты.
//
// Проверяется то, что ломается тихо: тип, пролезший из тела запроса через
// прототип; префикс, из-за которого визит попал бы в отчёты офиса по
// коммерческим предложениям; и «0 дней назад» вместо «сегодня».
// ══════════════════════════════════════════════════════════════════════

describe('таблица результатов', () => {
  it('у каждого обе подписи, свой тип и цвет', () => {
    const types = VISIT_OUTCOMES.map((o) => o.type);
    expect(new Set(types).size).toBe(types.length);
    for (const o of VISIT_OUTCOMES) {
      expect(o.ru, o.id).toBeTruthy();
      expect(o.uz, o.id).toBeTruthy();
      expect(o.token, o.id).toMatch(/^var\(--/);
    }
  });

  it('все типы начинаются с visit_ — иначе визит попадёт в отчёты по КП', () => {
    // Офис фильтрует по `b2b_offer_*` и `outreach` (sales_bot, marketing_bot).
    // Тип без префикса тихо смешался бы с воронкой предложений.
    for (const type of VISIT_TYPES) {
      expect(type, type).toMatch(/^visit_/);
    }
  });

  it('канал — визит, а не мессенджер по умолчанию', () => {
    // У `interactions.channel` значение по умолчанию 'telegram': оставить
    // его значило бы записать поездку перепиской.
    expect(VISIT_CHANNEL).toBe('visit');
  });
});

describe('проверка типа из запроса', () => {
  it('пропускает только известное', () => {
    expect(isVisitType('visit_deal')).toBe(true);
    expect(isVisitType('visit_выдумка')).toBe(false);
    expect(isVisitType(null)).toBe(false);
    expect(isVisitType(42)).toBe(false);
  });

  it('прототипные имена не считаются типами', () => {
    // Значение приходит телом запроса, то есть от кого угодно, а `in` у
    // обычного объекта отвечает true на 'constructor'.
    expect(isVisitType('constructor')).toBe(false);
    expect(isVisitType('toString')).toBe(false);
    expect(visitOutcome('constructor')).toBeNull();
  });
});

describe('подпись «когда были»', () => {
  it('сегодня — это «сегодня», а не «0 дней назад»', () => {
    // Человек, вернувшийся из поездки, читает свою же отметку, и «0 дней»
    // выглядит сбоем.
    expect(lastVisitLabel(0, 'ru')).toBe('Были сегодня');
    expect(lastVisitLabel(1, 'ru')).toBe('Были вчера');
    expect(lastVisitLabel(5, 'ru')).toContain('5');
  });

  it('не были ни разу — не подпись, а её отсутствие', () => {
    // Пустая строка нарисовала бы пустое место там, где ничего не должно
    // быть вовсе.
    expect(lastVisitLabel(null, 'ru')).toBeNull();
  });

  it('обе локали отвечают', () => {
    for (const days of [0, 1, 7]) {
      expect(lastVisitLabel(days, 'uz'), String(days)).toBeTruthy();
    }
  });
});
