import { describe, expect, it } from 'vitest';

import { outcomeText, planOutcome } from './planOutcome';

// Здесь числа превращаются в утверждение о дне человека, и по этому
// утверждению вечером начинается разговор. Поэтому правило проверяется
// тестами, а не глазами в колокольчике.

describe('planOutcome', () => {
  it('все точки отмечены — день закончен', () => {
    expect(planOutcome(8, 8).kind).toBe('done');
  });

  it('часть точек — не закончен, но и не срыв', () => {
    expect(planOutcome(8, 3).kind).toBe('partial');
  });

  it('ни одной — отдельный случай, а не «часть»', () => {
    // «Не успел» и «не поехал» — разные разговоры, и складывать их в один
    // сигнал значит однажды спросить не о том.
    expect(planOutcome(8, 0).kind).toBe('none');
  });

  it('пустой план не считается сорванным', () => {
    // Плана нет — и спрашивать не о чем: винить человека за отсутствие
    // задания нельзя.
    expect(planOutcome(0, 0).kind).toBe('none');
    expect(planOutcome(0, 0).total).toBe(0);
  });

  it('отмечено больше, чем в плане, — тоже закончен', () => {
    // Заехал сверх плана: считать это незакрытым днём было бы абсурдом.
    expect(planOutcome(3, 5).kind).toBe('done');
  });
});

describe('outcomeText', () => {
  it('закончен — спокойный тон, без похвалы и упрёка', () => {
    const t = outcomeText('Азиз', planOutcome(8, 8));
    expect(t.severity).toBe('info');
    expect(t.title).toContain('Азиз');
    expect(t.message).toContain('8');
  });

  it('не начат — предупреждение и точное число', () => {
    const t = outcomeText('Азиз', planOutcome(8, 0));
    expect(t.severity).toBe('warning');
    expect(t.message).toContain('ни одной');
  });

  it('часть — называет, сколько именно', () => {
    // «Не закончил» без числа — это упрёк без содержания.
    const t = outcomeText('Азиз', planOutcome(8, 3));
    expect(t.message).toContain('3');
    expect(t.message).toContain('8');
  });

  it('имя человека есть в каждом исходе', () => {
    for (const [total, done] of [[8, 8], [8, 3], [8, 0], [0, 0]] as const) {
      expect(outcomeText('Азиз', planOutcome(total, done)).title).toContain('Азиз');
    }
  });
});
