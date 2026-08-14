import { describe, expect, it } from 'vitest';
import { roleSatisfies } from '@/middleware';

// ══════════════════════════════════════════════════════════════════════
// Доступ агронома.
//
// Сажает не владелец, а сотрудник, и до этого показывать ему было нечего:
// вход по PIN давал роль SELLER с единственной вкладкой «Продажи», а посадки
// лежат под `/api/admin/*`, то есть под владельцем.
//
// Теплица и касса намеренно НЕ пересекаются: продавец не трогает партии,
// агроном не открывает смену. Проверяем обе стороны — «пускает кого надо»
// доказывается только вместе с «не пускает кого не надо».
// ══════════════════════════════════════════════════════════════════════

describe('доступ к теплице', () => {
  it('агроном проходит в производство', () => {
    expect(roleSatisfies('GROWER', 'PRODUCTION')).toBe(true);
  });

  it('владелец проходит везде', () => {
    expect(roleSatisfies('ADMIN', 'PRODUCTION')).toBe(true);
    expect(roleSatisfies('ADMIN', 'STAFF')).toBe(true);
    expect(roleSatisfies('ADMIN', 'ADMIN')).toBe(true);
  });

  it('продавец в теплицу не проходит', () => {
    expect(roleSatisfies('SELLER', 'PRODUCTION')).toBe(false);
  });

  it('агроном не проходит в кассу и в админские двери', () => {
    // Приход сырья, справочники, финансы — всё это остаётся владельцу.
    expect(roleSatisfies('GROWER', 'STAFF')).toBe(false);
    expect(roleSatisfies('GROWER', 'ADMIN')).toBe(false);
  });

  it('покупатель не проходит никуда, кроме своего кабинета', () => {
    expect(roleSatisfies('CUSTOMER', 'PRODUCTION')).toBe(false);
    expect(roleSatisfies('CUSTOMER', 'ADMIN')).toBe(false);
    expect(roleSatisfies('CUSTOMER', 'STAFF')).toBe(false);
    expect(roleSatisfies('CUSTOMER', 'CUSTOMER')).toBe(true);
  });
});
