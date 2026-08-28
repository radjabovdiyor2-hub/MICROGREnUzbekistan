import { describe, it, expect } from 'vitest';
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  costKind,
  isKnownCategory,
} from './categories';

describe('costKind', () => {
  it('относит закупки и налоги к переменным', () => {
    expect(costKind('supplies')).toBe('variable');
    expect(costKind('taxes')).toBe('variable');
  });

  it('относит аренду, зарплату и маркетинг к постоянным', () => {
    expect(costKind('rent')).toBe('fixed');
    expect(costKind('salary')).toBe('fixed');
    expect(costKind('marketing')).toBe('fixed');
  });

  // Смысл проверки не в самом значении, а в ЗАЩИТЕ ОТ ТИХОГО ЗАНИЖЕНИЯ
  // точки безубыточности. Если кто-то решит, что неизвестной статье
  // логичнее быть переменной, тест обязан покраснеть и заставить прочитать
  // комментарий в categories.ts, а не молча пропустить смену стороны.
  it('считает неизвестную статью постоянной — ошибка в безопасную сторону', () => {
    expect(costKind('чего-то-такого-нет')).toBe('fixed');
    expect(costKind('')).toBe('fixed');
  });

  it('размечает каждую статью расходов — без пропусков', () => {
    for (const category of EXPENSE_CATEGORIES) {
      expect(category.kind, `статья ${category.value} без разметки`).toBeDefined();
    }
  });

  it('не размечает доходы: они на постоянные и переменные не делятся', () => {
    for (const category of INCOME_CATEGORIES) {
      expect(category.kind).toBeUndefined();
    }
  });
});

describe('isKnownCategory', () => {
  it('узнаёт свои статьи и служебное сторно', () => {
    expect(isKnownCategory('expense', 'rent')).toBe(true);
    expect(isKnownCategory('income', 'sales')).toBe(true);
    expect(isKnownCategory('income', 'sales_cancelled')).toBe(true);
  });

  it('не путает доходные статьи с расходными', () => {
    expect(isKnownCategory('expense', 'sales')).toBe(false);
    expect(isKnownCategory('income', 'rent')).toBe(false);
  });
});
