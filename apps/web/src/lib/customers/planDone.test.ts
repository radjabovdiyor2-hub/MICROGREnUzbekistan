import { describe, expect, it } from 'vitest';

import { markIndex, markKey, stopState, type VisitMark } from './planDone';

// ══════════════════════════════════════════════════════════════════════
// Кто закрыл остановку и чем.
//
// Ошибка здесь не падает и не логируется: план просто редеет сам собой, а
// владелец читает 6 из 8 у человека, сделавшего три. Поэтому правило
// вынесено в чистую функцию и проверяется отдельно от базы.
// ══════════════════════════════════════════════════════════════════════

function mark(over: Partial<VisitMark> = {}): VisitMark {
  return { customerId: 1, botName: 'Азиз', distanceM: 40, accuracyM: 12, ...over };
}

describe('markIndex', () => {
  it('чужая отметка не закрывает мою остановку', () => {
    // РАДИ ЭТОГО ВСЁ И ЗАТЕВАЛОСЬ. Двое поехали в один район, отметился
    // один — у второго план не должен поредеть.
    const index = markIndex([mark({ botName: 'Давлат', customerId: 7 })]);

    expect(index.has(markKey('Давлат', 7))).toBe(true);
    expect(index.has(markKey('Азиз', 7))).toBe(false);
  });

  it('отметка без автора не закрывает ничего', () => {
    // Пустой автор закрыл бы точку сразу у всех — это и есть прежняя
    // поломка, только записанная иначе.
    const index = markIndex([mark({ botName: null }), mark({ botName: '' })]);
    expect(index.size).toBe(0);
  });

  it('клиент без номера пропускается, а не роняет разбор', () => {
    expect(markIndex([mark({ customerId: null })]).size).toBe(0);
  });

  it('берётся последняя отметка по времени, а не первая', () => {
    // Вызывающий отдаёт по убыванию времени. Продавец вернулся вечером и
    // заменил «не застал» на «договорились» — показывать надо итог.
    const index = markIndex([
      mark({ distanceM: 25 }), // вечерняя, она же первая в выдаче
      mark({ distanceM: 900 }), // утренняя
    ]);
    expect(index.get(markKey('Азиз', 1))?.distanceM).toBe(25);
  });

  it('доказательство расстояния сохраняется как есть', () => {
    const index = markIndex([mark({ distanceM: null, accuracyM: null })]);
    expect(index.get(markKey('Азиз', 1))).toEqual({ distanceM: null, accuracyM: null });
  });

  it('пусто — пустой указатель, а не падение', () => {
    expect(markIndex([]).size).toBe(0);
  });
});

describe('stopState', () => {
  it('отмеченная точка — «выполнено»', () => {
    expect(stopState(true, null)).toBe('done');
  });

  it('заехал и не отметил — это НЕ выполнено', () => {
    // Владелец должен отличать «не был» от «был, но не нажал». Считать
    // стоянку выполнением значило бы закрывать план приездом, а владелец
    // решил иначе: выполнение — явная отметка человека.
    expect(stopState(false, '2026-09-12T11:20:00.000Z')).toBe('arrived');
  });

  it('ни отметки, ни заезда — открыта', () => {
    expect(stopState(false, null)).toBe('open');
  });

  it('отметка старше заезда всё равно главнее', () => {
    expect(stopState(true, '2026-09-12T11:20:00.000Z')).toBe('done');
  });
});
