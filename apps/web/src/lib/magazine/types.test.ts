import { describe, it, expect } from 'vitest';
import {
  composeMagazine,
  SECTION_ORDER,
  SECTION_TITLES,
} from './types';
import type { Block, BlockType, MagazineSpec } from './types';

// Минимальные валидные блоки для проверки сборки/сортировки.
const cover: Block = { id: 'c', type: 'cover', audience: 'all', origin: 'personal', title: 'X' };
const toc: Block = { id: 't', type: 'toc', audience: 'all', origin: 'personal' };
const recipe: Block = { id: 'r', type: 'recipe', audience: 'women', origin: 'shared', title: 'R' };
const family: Block = { id: 'f', type: 'familyConversion', audience: 'family', origin: 'personal' };

const spec = (blocks: Block[]): MagazineSpec => ({ blocks });

describe('magazine/types · composeMagazine', () => {
  it('объединяет shared + personal и упорядочивает по SECTION_ORDER', () => {
    // На входе намеренно перемешанный порядок
    const shared = spec([recipe]);
    const personal = spec([family, toc, cover]);
    const out = composeMagazine(shared, personal).map((b) => b.type);
    expect(out).toEqual(['cover', 'toc', 'recipe', 'familyConversion']);
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
    expect(composeMagazine(spec([family]), null).map((b) => b.type)).toEqual(['familyConversion']);
  });
});

describe('magazine/types · SECTION_ORDER', () => {
  // Блок, забытый в SECTION_ORDER, уезжает в конец журнала молча —
  // поэтому перечни обязаны совпадать.
  it('покрывает все типы блоков ровно один раз', () => {
    const known = Object.keys(SECTION_TITLES) as BlockType[];
    expect([...SECTION_ORDER].sort()).toEqual([...known].sort());
    expect(new Set(SECTION_ORDER).size).toBe(SECTION_ORDER.length);
  });
});
