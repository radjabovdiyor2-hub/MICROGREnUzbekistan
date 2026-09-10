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
function passes(role: 'ADMIN' | 'SELLER', path: string, method: string): boolean {
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

  it('читает и сохраняет план объезда — свой', () => {
    // Рубеж «свой/чужой» стоит ВНУТРИ роута, по имени сотрудника:
    // сюда продавца пускаем, а чужой план ему всё равно не отдадут.
    expect(passes('SELLER', '/api/admin/visit-plans', 'GET')).toBe(true);
    expect(passes('SELLER', '/api/admin/visit-plans', 'POST')).toBe(true);
  });

  it('заводит заведение: он стоит у дверей, которых нет в базе', () => {
    // Заводить вечером со слов продавца — значит терять адрес,
    // координату и половину самих заведений.
    expect(passes('SELLER', '/api/admin/customers', 'POST')).toBe(true);
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

// ══════════════════════════════════════════════════════════════════════
// Своя смена и чужой график — две разные двери.
//
// `/api/admin/shifts` — это график: его составляет владелец, и в нём
// видны смены всех. `/api/shift` — своя смена: открыть, закрыть, узнать
// состояние. Пути похожи, и перепутать их означает либо запереть человека
// от собственной смены (как было до сих пор), либо открыть ему чужие.
// ══════════════════════════════════════════════════════════════════════

describe('смена сотрудника', () => {
  it('продавец открывает и закрывает СВОЮ смену', () => {
    // До этого отметить начало и конец своей смены он не мог нигде: ни в
    // приложении, ни в боте.
    expect(passes('SELLER', '/api/shift', 'POST')).toBe(true);
    expect(passes('SELLER', '/api/shift', 'GET')).toBe(true);
  });

  it('график смен остаётся владельцу', () => {
    // Иначе продавец правил бы расписание всей команды.
    expect(passes('SELLER', '/api/admin/shifts', 'GET')).toBe(false);
    expect(passes('SELLER', '/api/admin/shifts', 'POST')).toBe(false);
    expect(passes('SELLER', '/api/admin/shifts', 'DELETE')).toBe(false);
  });

  it('владелец может и то, и другое', () => {
    expect(passes('ADMIN', '/api/shift', 'POST')).toBe(true);
    expect(passes('ADMIN', '/api/admin/shifts', 'POST')).toBe(true);
  });

  it('удаление своей смены дверью не предусмотрено', () => {
    // Смену не удаляют, её закрывают: удалённая смена — это стёртый факт
    // работы, и восстановить его нечем.
    expect(passes('SELLER', '/api/shift', 'DELETE')).toBe(false);
  });
});
