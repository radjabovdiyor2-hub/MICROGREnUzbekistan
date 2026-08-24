import { describe, expect, it } from 'vitest';

import { planSource, resolveReadAssignee, resolveSaveAssignee } from './planAssignee';

// ══════════════════════════════════════════════════════════════════════
// Рубеж «свой план / чужой план».
//
// Здесь проверяется не удобство, а права. Ошибка в любую сторону тихая:
// ничего не падает, в логах пусто, а продавец либо видит чужой день, либо
// переписывает его.
//
// Главный случай — подделка в теле запроса: продавец присылает чужое имя.
// Именно так это и попробуют, если попробуют вообще.
// ══════════════════════════════════════════════════════════════════════

describe('кому сохраняем план', () => {
  it('продавец сохраняет только себе, что бы ни прислал', () => {
    expect(
      resolveSaveAssignee({ isOwner: false, actor: 'Азиз', requested: 'Бекзод' }),
    ).toBe('Азиз');
  });

  it('пустое имя в запросе продавца тоже становится им самим', () => {
    expect(resolveSaveAssignee({ isOwner: false, actor: 'Азиз', requested: '' })).toBe('Азиз');
  });

  it('владелец назначает кому угодно', () => {
    expect(
      resolveSaveAssignee({ isOwner: true, actor: 'Владелец', requested: 'Бекзод' }),
    ).toBe('Бекзод');
  });

  it('владелец может оставить план ничьим — это черновик', () => {
    expect(resolveSaveAssignee({ isOwner: true, actor: 'Владелец', requested: '  ' })).toBe('');
  });
});

describe('чьи планы отдаём', () => {
  it('продавцу — только его, даже если просит чужое', () => {
    expect(
      resolveReadAssignee({ isOwner: false, actor: 'Азиз', requested: 'Бекзод' }),
    ).toBe('Азиз');
  });

  it('владельцу без уточнения — все', () => {
    // undefined здесь значит «не фильтровать», и достаётся оно только ему.
    expect(
      resolveReadAssignee({ isOwner: true, actor: 'Владелец', requested: null }),
    ).toBeUndefined();
  });

  it('владельцу с уточнением — только спрошенный', () => {
    expect(
      resolveReadAssignee({ isOwner: true, actor: 'Владелец', requested: 'Азиз' }),
    ).toBe('Азиз');
  });
});

describe('происхождение плана', () => {
  it('собрал себе — self, даже если это владелец', () => {
    // Источник описывает происхождение плана, а не должность автора.
    expect(planSource({ assignee: 'Азиз', author: 'Азиз' })).toBe('self');
    expect(planSource({ assignee: 'Владелец', author: 'Владелец' })).toBe('self');
  });

  it('назначен другому — owner', () => {
    expect(planSource({ assignee: 'Азиз', author: 'Владелец' })).toBe('owner');
  });
});
