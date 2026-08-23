import { beforeEach, describe, expect, it, vi } from 'vitest';

import { backDepth, goBack, onBackDepth, pushBack } from './adminBack';

// ══════════════════════════════════════════════════════════════════════
// Стопка возвратов.
//
// Открыв карточку заказа внутри Telegram, человек жал аппаратное «назад» и
// выходил ИЗ ПРИЛОЖЕНИЯ: переход «список → карточка» живёт в состоянии
// экрана, а не в истории браузера. Стопка даёт кнопке Telegram знать, есть
// ли куда возвращаться.
//
// Состояние здесь модульное и переживает перемонтирование компонентов —
// поэтому каждый тест обязан за собой убирать.
// ══════════════════════════════════════════════════════════════════════

beforeEach(() => {
  // Подчищаем хвосты предыдущего теста: стопка одна на модуль.
  while (goBack()) { /* обработчики тестов ничего не делают */ }
});

describe('глубина', () => {
  it('на верхнем уровне возвращаться некуда', () => {
    expect(backDepth()).toBe(0);
    expect(goBack()).toBe(false);
  });

  it('открытый экран поднимает глубину, закрытый опускает', () => {
    const off = pushBack(() => undefined);
    expect(backDepth()).toBe(1);
    off();
    expect(backDepth()).toBe(0);
  });
});

describe('порядок возврата', () => {
  it('шаг за шагом, а не сразу на список', () => {
    const order: string[] = [];
    const offCard = pushBack(() => order.push('карточка'));
    const offSale = pushBack(() => order.push('касса'));

    // Верхний экран — касса, открытая поверх карточки.
    goBack();
    expect(order).toEqual(['касса']);

    offSale();
    goBack();
    expect(order).toEqual(['касса', 'карточка']);
    offCard();
  });

  it('снятие идёт по ссылке, а не «сверху»', () => {
    // Экраны закрываются не всегда в обратном порядке: снятие верхнего
    // наугад однажды убрало бы чужой обработчик.
    const hit: string[] = [];
    const offFirst = pushBack(() => hit.push('первый'));
    pushBack(() => hit.push('второй'));

    offFirst();
    goBack();

    expect(hit).toEqual(['второй']);
    expect(backDepth()).toBe(0);
  });
});

describe('подписка', () => {
  it('сообщает текущее значение сразу', () => {
    const seen = vi.fn();
    const off = onBackDepth(seen);
    expect(seen).toHaveBeenCalledWith(0);
    off();
  });

  it('сообщает об открытии и закрытии экрана', () => {
    const seen: number[] = [];
    const offListen = onBackDepth((depth) => seen.push(depth));

    const off = pushBack(() => undefined);
    off();
    offListen();

    expect(seen).toEqual([0, 1, 0]);
  });

  it('отписавшийся больше не слушает', () => {
    const seen = vi.fn();
    onBackDepth(seen)();
    seen.mockClear();

    const off = pushBack(() => undefined);
    expect(seen).not.toHaveBeenCalled();
    off();
  });
});
