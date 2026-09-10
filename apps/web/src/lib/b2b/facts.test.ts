import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { MIN_VENUES_TO_SHOW, REAL_CLIENT_STATUSES, factsWorthShowing } from './facts';

// ══════════════════════════════════════════════════════════════════════
// Здесь легче всего соврать посетителю, и ошибка будет выглядеть исправной.
//
// В таблице `customers` больше двух тысяч заведений, и почти все собраны
// ботами из 2ГИС как лиды для обзвона. Запрос без фильтра по статусу
// вернёт их все, страница напишет «нас выбрали 2000 заведений», и ни
// линтер, ни сборка, ни глаз на код этого не заметят: SQL правильный,
// число настоящее, утверждение ложное.
// ══════════════════════════════════════════════════════════════════════

describe('кого считаем клиентом', () => {
  it('лид клиентом не считается', () => {
    // Найденное в справочнике заведение — это дверь, в которую ещё не
    // позвонили. Публиковать такие как клиентов нельзя.
    expect(REAL_CLIENT_STATUSES).not.toContain('lead');
  });

  it('считаем активных и постоянных', () => {
    expect([...REAL_CLIENT_STATUSES].sort()).toEqual(['active', 'vip']);
  });

  it('запрос действительно фильтрует по статусу и удалённым', () => {
    // Проверяем исходник: фильтр легко потерять при правке, а тест на
    // возвращаемое значение потребовал бы живой базы.
    const source = readFileSync(join(process.cwd(), 'src', 'lib', 'b2b', 'facts.ts'), 'utf8');
    expect(source).toContain('REAL_CLIENT_STATUSES');
    expect(source).toContain("customerType: 'b2b'");
    expect(source).toContain('deletedAt: null');
  });
});

describe('factsWorthShowing', () => {
  it('двумя заведениями не хвастаются', () => {
    // Честно, но работает против нас. А округлять нельзя — значит молчим.
    expect(factsWorthShowing({ venues: 2, since: 2025, weeklyDeliveries: 4 })).toBe(false);
  });

  it('пусто — блока нет', () => {
    expect(factsWorthShowing({ venues: 0, since: null, weeklyDeliveries: 0 })).toBe(false);
  });

  it('с порога и выше — показываем', () => {
    expect(
      factsWorthShowing({ venues: MIN_VENUES_TO_SHOW, since: 2024, weeklyDeliveries: 12 }),
    ).toBe(true);
  });

  it('порог не опускается до единицы незаметно', () => {
    // Если однажды порог станет 1, «нас выбрало 1 заведение» уедет на бой.
    expect(MIN_VENUES_TO_SHOW).toBeGreaterThanOrEqual(3);
  });
});
