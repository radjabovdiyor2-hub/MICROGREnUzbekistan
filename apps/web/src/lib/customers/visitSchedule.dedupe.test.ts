import { describe, expect, it } from 'vitest';

// Функция живёт в роуте `/api/admin/visit-schedules` — её незачем выносить
// в библиотеку ради одного вызова. Здесь проверяется её ПРАВИЛО, поэтому
// логика повторена ровно и коротко: разойдись они, тест перестанет
// защищать то, что защищает.
//
// РЕГРЕССИЯ. Расписание адресное: у клиента законно бывают разные дни у
// разных людей. Но есть и безымянная строка «любому, кто поедет», и
// владелец, назначающий субботу Азизу, её не стирает — клиент оказывался
// в списке дня ДВАЖДЫ, и в диалоге назначения его было видно два раза.
function dedupeByCustomer<T extends { customerId: number; assignee: string }>(rows: T[]): T[] {
  const best = new Map<number, T>();
  for (const row of rows) {
    const kept = best.get(row.customerId);
    if (!kept || (kept.assignee === '' && row.assignee !== '')) {
      best.set(row.customerId, row);
    }
  }
  return [...best.values()];
}

const row = (customerId: number, assignee: string, id = 0) => ({ customerId, assignee, id });

describe('один клиент — одна строка в дне', () => {
  it('безымянная и именованная схлопываются в одну', () => {
    const out = dedupeByCustomer([row(1, ''), row(1, 'Азиз')]);
    expect(out).toHaveLength(1);
  });

  it('именованная побеждает безымянную независимо от порядка', () => {
    // «К этому едет Азиз» — более точное знание, чем «кто-нибудь».
    expect(dedupeByCustomer([row(1, ''), row(1, 'Азиз')])[0].assignee).toBe('Азиз');
    expect(dedupeByCustomer([row(1, 'Азиз'), row(1, '')])[0].assignee).toBe('Азиз');
  });

  it('разные клиенты не схлопываются', () => {
    expect(dedupeByCustomer([row(1, 'Азиз'), row(2, 'Бекзод')])).toHaveLength(2);
  });

  it('две именованные строки одного клиента не выбирают наугад дважды', () => {
    // Такого быть не должно (уникальность стоит по customer+weekday+
    // assignee, а день здесь один), но если случится — в списке остаётся
    // одна строка, а не две одинаковые точки в объезде.
    const out = dedupeByCustomer([row(1, 'Азиз'), row(1, 'Бекзод')]);
    expect(out).toHaveLength(1);
    expect(out[0].assignee).toBe('Азиз');
  });

  it('пустой список не ломается', () => {
    expect(dedupeByCustomer([])).toEqual([]);
  });
});
