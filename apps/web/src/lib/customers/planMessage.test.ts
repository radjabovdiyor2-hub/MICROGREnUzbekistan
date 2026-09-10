import { describe, expect, it } from 'vitest';

import {
  MAX_LINES,
  assignedPlanText,
  escapeHtml,
  planLines,
  planProgress,
  type PlanStopLine,
} from './planMessage';

function stop(name: string, done = false, district?: string): PlanStopLine {
  return { name, done, district };
}

describe('planLines', () => {
  it('нумерует точки и зачёркивает пройденные', () => {
    const text = planLines([stop('Плов Центр', true), stop('Чайхана')]);
    expect(text).toContain('1. <s>Плов Центр</s> ✅');
    expect(text).toContain('2. Чайхана');
  });

  it('пройденные не прячет — иначе объём дня выглядит меньше', () => {
    // Спрятать выполненное значит соврать про работу: человек видит две
    // точки вместо восьми и не понимает, много ли сделал.
    const text = planLines([stop('А', true), stop('Б', true), stop('В')]);
    expect(text.split('\n')).toHaveLength(3);
  });

  it('длинный список обрезает и говорит, сколько скрыто', () => {
    const many = Array.from({ length: MAX_LINES + 5 }, (_, i) => stop(`Точка ${i}`));
    const text = planLines(many);
    expect(text).toContain('и ещё 5');
  });

  it('пустой план — это ответ, а не пустая строка', () => {
    expect(planLines([])).toBe('Точек нет.');
  });

  it('район дописывается, если он есть', () => {
    expect(planLines([stop('Плов', false, 'Сиаб')])).toContain('Плов · Сиаб');
  });
});

describe('planProgress', () => {
  it('считает остаток', () => {
    expect(planProgress([stop('А', true), stop('Б'), stop('В')])).toBe('Осталось 2 из 3');
  });

  it('всё пройдено — говорит об этом, а не «осталось 0»', () => {
    expect(planProgress([stop('А', true)])).toBe('Все 1 объехали');
  });

  it('пустой план не делит на ноль', () => {
    expect(planProgress([])).toBe('Точек нет');
  });
});

describe('escapeHtml', () => {
  it('обезвреживает символы разметки', () => {
    // «Плов & Co» ломает HTML-разметку Telegram, и сообщение НЕ
    // доставляется вовсе: ответ 400, а человек просто не получает задание.
    expect(escapeHtml('Плов & Co <Центр>')).toBe('Плов &amp; Co &lt;Центр&gt;');
  });
});

describe('assignedPlanText', () => {
  it('называет дату, число точек и сам список', () => {
    const text = assignedPlanText({
      dateLabel: '12.09.2026',
      stops: [stop('Плов Центр'), stop('Чайхана')],
    });
    expect(text).toContain('12.09.2026');
    expect(text).toContain('2 точек');
    expect(text).toContain('1. Плов Центр');
  });

  it('список товаров дописывается, когда он есть', () => {
    const text = assignedPlanText({
      dateLabel: '12.09.2026',
      stops: [stop('Плов Центр')],
      goods: [{ name: 'Руккола', qty: 3, unit: 'лоток' }],
    });
    expect(text).toContain('Взять с собой');
    expect(text).toContain('Руккола — 3 лоток');
  });

  it('без товаров раздела нет — объезд бывает разведочный', () => {
    const text = assignedPlanText({ dateLabel: '12.09.2026', stops: [stop('Плов')] });
    expect(text).not.toContain('Взять с собой');
  });

  it('название с амперсандом не ломает сообщение', () => {
    const text = assignedPlanText({ dateLabel: '12.09.2026', stops: [stop('Плов & Co')] });
    expect(text).toContain('Плов &amp; Co');
  });
});
