import { describe, it, expect } from 'vitest';
import {
  composeMagazine,
  mechanicForWeek,
  SECTION_ORDER,
  KIDS_MECHANIC_ORDER,
} from './types';
import type { Block, MagazineSpec } from './types';

// Минимальные валидные блоки для проверки сборки/сортировки.
const cover: Block = { id: 'c', type: 'cover', audience: 'all', origin: 'personal', title: 'X' };
const toc: Block = { id: 't', type: 'toc', audience: 'all', origin: 'personal' };
const recipe: Block = { id: 'r', type: 'recipe', audience: 'women', origin: 'shared', title: 'R' };
const kids: Block = { id: 'n', type: 'kids', audience: 'kids', origin: 'shared', mechanic: 'ar_coloring', title: 'N' };

const spec = (blocks: Block[]): MagazineSpec => ({ blocks });

describe('magazine/types · composeMagazine', () => {
  it('объединяет shared + personal и упорядочивает по SECTION_ORDER', () => {
    // На входе намеренно перемешанный порядок
    const shared = spec([recipe, kids]);
    const personal = spec([toc, cover]);
    const out = composeMagazine(shared, personal).map((b) => b.type);
    expect(out).toEqual(['cover', 'toc', 'recipe', 'kids']);
    // порядок соответствует индексам в каноничном SECTION_ORDER
    const ranks = out.map((t) => SECTION_ORDER.indexOf(t));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it('персональный блок перекрывает shared того же типа', () => {
    const sharedCover: Block = { ...cover, id: 'shared-cover', origin: 'shared', title: 'SHARED' };
    const personalCover: Block = { ...cover, id: 'personal-cover', origin: 'personal', title: 'PERSONAL' };
    const out = composeMagazine(spec([sharedCover]), spec([personalCover]));
    const covers = out.filter((b) => b.type === 'cover');
    expect(covers).toHaveLength(1);
    expect(covers[0].id).toBe('personal-cover');
  });

  it('устойчив к null-спекам', () => {
    expect(composeMagazine(null, null)).toEqual([]);
    expect(composeMagazine(spec([kids]), null).map((b) => b.type)).toEqual(['kids']);
  });
});

describe('magazine/types · mechanicForWeek', () => {
  it('цикл по 3 механикам: неделя N и N+3 совпадают', () => {
    expect(mechanicForWeek(1)).toBe(mechanicForWeek(4));
    expect(mechanicForWeek(1)).toBe(KIDS_MECHANIC_ORDER[0]);
    expect(mechanicForWeek(3)).toBe(KIDS_MECHANIC_ORDER[2]);
  });

  it('покрывает все 3 механики за 3 недели', () => {
    const got = new Set(Array.from({ length: 3 }, (_, i) => mechanicForWeek(i + 1)));
    expect(got.size).toBe(KIDS_MECHANIC_ORDER.length);
  });

  it('безопасен для 0 и отрицательных номеров', () => {
    expect(KIDS_MECHANIC_ORDER).toContain(mechanicForWeek(0));
    expect(KIDS_MECHANIC_ORDER).toContain(mechanicForWeek(-3));
  });
});
