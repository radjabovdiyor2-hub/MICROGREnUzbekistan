import { describe, it, expect } from 'vitest';
import { defaultSharedSpec, defaultPersonalSpec } from './defaults';
import { SECTION_TITLES } from './types';
import type { BlockType } from './types';

const KNOWN_TYPES = new Set(Object.keys(SECTION_TITLES) as BlockType[]);

function assertValid(blocks: { id: string; type: string }[]) {
  // все типы известны движку (SECTION_TITLES = полный перечень BlockType)
  for (const b of blocks) expect(KNOWN_TYPES.has(b.type as BlockType)).toBe(true);
  // id уникальны — иначе React-ключи в MagazineDocument конфликтуют
  const ids = blocks.map((b) => b.id);
  expect(new Set(ids).size).toBe(ids.length);
}

describe('magazine/defaults · defaultSharedSpec', () => {
  it('все блоки валидного типа и с уникальными id', () => {
    assertValid(defaultSharedSpec(1).blocks);
  });

  it('содержит рецепт недели', () => {
    const recipe = defaultSharedSpec(1).blocks.find((b) => b.type === 'recipe');
    expect(recipe).toBeDefined();
  });
});

describe('magazine/defaults · defaultPersonalSpec', () => {
  it('все блоки валидного типа и с уникальными id', () => {
    assertValid(defaultPersonalSpec('Тест-Ресторан').blocks);
  });

  it('подставляет имя ресторана в персональные блоки', () => {
    const blocks = defaultPersonalSpec('Плов-Хаус').blocks;
    const row = blocks.find((b) => b.type === 'restaurantOfWeek') as any;
    expect(row.name).toBe('Плов-Хаус');
    const toc = blocks.find((b) => b.type === 'toc') as any;
    expect(toc.editorialNote).toContain('Плов-Хаус');
  });

  it('ресторан недели и слово шефа — персональные', () => {
    const blocks = defaultPersonalSpec('Плов-Хаус').blocks;
    expect(blocks.find((b) => b.type === 'restaurantOfWeek')?.origin).toBe('personal');
    expect(blocks.find((b) => b.type === 'chefWord')?.origin).toBe('personal');
  });
});
