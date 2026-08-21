import { describe, expect, it } from 'vitest';

import { findRule, roleSatisfies } from '@/middleware';

// ══════════════════════════════════════════════════════════════════════
// Что открыто продавцу в клиентах и на карте.
//
// Карта сделана для того, кто ездит, — и до этого была заперта от него
// правилом `{ prefix: '/api/admin', access: 'ADMIN' }`. Открывая её,
// легко открыть заодно и лишнее: бонусы, статус клиента, удаление пачкой.
//
// Таблица правил расходится МОЛЧА: лишний метод в списке не падает, он
// просто пускает не того. Поэтому проверяется не «есть ли правило», а
// какой доступ получает конкретная пара «путь + метод», и обе стороны —
// «пускает кого надо» доказывается только вместе с «не пускает кого не
// надо».
// ══════════════════════════════════════════════════════════════════════

/** Пройдёт ли роль по правилу, которое middleware выберет для этой двери. */
function passes(role: 'ADMIN' | 'SELLER' | 'GROWER', path: string, method: string): boolean {
  const rule = findRule(path, method);
  // Правила нет — дверь вообще не под охраной middleware; в этом файле
  // таких путей нет, и молчаливое `true` скрыло бы ошибку в таблице.
  if (!rule) return false;
  return roleSatisfies(role, rule.access);
}

describe('продавец в клиентах и на карте', () => {
  it('читает список, карточку и карту', () => {
    for (const path of [
      '/api/admin/customers',
      '/api/admin/customers/map',
      '/api/admin/customers/map/delivery',
    ]) {
      expect(passes('SELLER', path, 'GET'), path).toBe(true);
    }
  });

  it('переставляет пин: он стоит у дверей, а геокодер нет', () => {
    expect(passes('SELLER', '/api/admin/customers/map', 'PATCH')).toBe(true);
  });

  it('отмечает визит — ради этого карта и открывалась', () => {
    expect(passes('SELLER', '/api/admin/customers/visits', 'POST')).toBe(true);
  });
});

describe('что осталось владельцу', () => {
  it('бонусы и статус клиента — это деньги', () => {
    expect(passes('SELLER', '/api/admin/customers', 'PUT')).toBe(false);
    expect(passes('ADMIN', '/api/admin/customers', 'PUT')).toBe(true);
  });

  it('удаление карточек, в том числе пачкой', () => {
    expect(passes('SELLER', '/api/admin/customers', 'DELETE')).toBe(false);
    expect(passes('ADMIN', '/api/admin/customers', 'DELETE')).toBe(true);
  });

  it('пакетный геокодер — он жжёт квоту провайдера', () => {
    expect(passes('SELLER', '/api/admin/customers/geocode', 'POST')).toBe(false);
    expect(passes('ADMIN', '/api/admin/customers/geocode', 'POST')).toBe(true);
  });

  it('остальная админка не открылась заодно', () => {
    // Самая дорогая ошибка здесь — слишком короткий префикс: правило
    // `/api/admin` со STAFF открыло бы продавцу финансы, товары и ботов.
    for (const path of [
      '/api/admin/orders',
      '/api/admin/finances',
      '/api/admin/settings',
      '/api/admin/customers-export',
    ]) {
      expect(passes('SELLER', path, 'GET'), path).toBe(false);
    }
  });
});

describe('агроном сюда не проходит', () => {
  it('ни читать, ни отмечать', () => {
    // Теплица и клиенты не пересекаются: агроном ведёт посадки.
    expect(passes('GROWER', '/api/admin/customers', 'GET')).toBe(false);
    expect(passes('GROWER', '/api/admin/customers/map', 'GET')).toBe(false);
    expect(passes('GROWER', '/api/admin/customers/visits', 'POST')).toBe(false);
  });

  it('а его собственная дверь по-прежнему открыта', () => {
    expect(passes('GROWER', '/api/admin/grow-batches', 'POST')).toBe(true);
  });
});
