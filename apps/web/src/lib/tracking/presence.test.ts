import { describe, expect, it } from 'vitest';

import { SILENT_MIN } from './ping';
import { presenceState } from './presence';

// Сторож пишет живому человеку, и ошибается он молча: лишнее сообщение в
// законный выходной выглядит как работающая система. Поэтому решение
// проверяется здесь, а не на живом дне.

describe('presenceState', () => {
  it('без смены молчим, даже если человек не выходил на связь неделю', () => {
    expect(presenceState(false, null)).toBe('off');
    expect(presenceState(false, 600)).toBe('off');
  });

  it('смена идёт, а точек не было ни одной — запись не включена', () => {
    expect(presenceState(true, null)).toBe('never');
  });

  it('точки были и прекратились — трансляция оборвалась', () => {
    expect(presenceState(true, SILENT_MIN)).toBe('silent');
    expect(presenceState(true, SILENT_MIN + 5)).toBe('silent');
  });

  it('короткое молчание — это лифт и подвал, а не повод писать', () => {
    expect(presenceState(true, 0)).toBe('ok');
    expect(presenceState(true, SILENT_MIN - 1)).toBe('ok');
  });

  it('ноль минут и «точек не было» — разные вещи', () => {
    // Свести их в одно число значит сказать «запись не включена» тому, кто
    // только что прислал точку.
    expect(presenceState(true, 0)).not.toBe(presenceState(true, null));
  });

  it('порог можно задать свой — но по умолчанию он общий с картой', () => {
    expect(presenceState(true, 10, 5)).toBe('silent');
    expect(presenceState(true, 10)).toBe('ok');
  });
});
