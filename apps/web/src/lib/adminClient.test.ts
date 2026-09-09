import { describe, expect, it, vi } from 'vitest';

import { pickArray } from './adminClient';

// ══════════════════════════════════════════════════════════════════════
// Разбор списка из ответа админского API.
//
// ЗАЧЕМ ТЕСТ. Здесь стояло `Array.isArray(data) ? data : []`, и ответ вида
// `{ employees: [...] }` превращался в ПУСТОЙ массив молча. Из-за этого
// выпадающий список сотрудников в «Назначить объезд» был пуст всегда, и
// назначить объезд было некому — при том, что сотрудники в базе есть.
//
// Поломка не падает и не пишет в лог: экран просто выглядит так, будто
// данных нет. Такое ловится только тестом.
// ══════════════════════════════════════════════════════════════════════

describe('pickArray', () => {
  it('голый массив берёт как есть', () => {
    expect(pickArray([1, 2, 3])).toEqual([1, 2, 3]);
    expect(pickArray([])).toEqual([]);
  });

  it('разворачивает единственное поле-массив', () => {
    // Ровно форма `/api/inventory/employees`, на которой всё и сломалось.
    expect(pickArray({ employees: [{ id: 'a' }] })).toEqual([{ id: 'a' }]);
  });

  it('находит список рядом со счётчиками и флагами', () => {
    // `{ status, total, hasMore, customers }` — обычная форма списка.
    const body = { status: 'ok', total: 2, hasMore: false, customers: [{ id: 1 }, { id: 2 }] };
    expect(pickArray(body)).toHaveLength(2);
  });

  it('ошибка вместо списка — пусто, а не падение', () => {
    // Ради этого помощник и заводился: `x.map is not a function`.
    expect(pickArray({ error: 'Unauthorized' })).toEqual([]);
    expect(pickArray(null)).toEqual([]);
    expect(pickArray('нет')).toEqual([]);
    expect(pickArray(undefined)).toEqual([]);
  });

  it('два списка в ответе — не угадываем, а говорим вслух', () => {
    // Догадка здесь однажды подставит не тот список, и на экране окажется
    // чужое. Пусто и предупреждение честнее.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(pickArray({ items: [1], categories: [2] }, '/api/x')).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('пустое поле-массив остаётся пустым, а не считается отсутствующим', () => {
    expect(pickArray({ employees: [] })).toEqual([]);
  });
});
