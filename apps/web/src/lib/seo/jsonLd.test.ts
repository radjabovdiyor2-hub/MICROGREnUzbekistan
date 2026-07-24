import { describe, it, expect } from 'vitest';
import { breadcrumbList, collectionPage, SITE_DOMAIN } from './jsonLd';

describe('seo · collectionPage', () => {
  it('достраивает домен к относительным URL позиций', () => {
    const ld = collectionPage({
      name: 'Рецепты', description: 'd', url: `${SITE_DOMAIN}/recipe`,
      items: [{ url: '/recipe/salat', name: 'Салат' }, { url: '/product/p1', name: 'Руккола' }],
    });
    const list = ld.mainEntity.itemListElement;
    expect(list.map((i) => i.url)).toEqual([
      `${SITE_DOMAIN}/recipe/salat`,
      `${SITE_DOMAIN}/product/p1`,
    ]);
    expect(list.map((i) => i.position)).toEqual([1, 2]);
    expect(ld.mainEntity.numberOfItems).toBe(2);
  });

  it('не дублирует домен в абсолютных URL', () => {
    const ld = collectionPage({
      name: 'n', description: 'd', url: `${SITE_DOMAIN}/recipe`,
      items: [{ url: `${SITE_DOMAIN}/recipe/x`, name: 'X' }],
    });
    expect(ld.mainEntity.itemListElement[0].url).toBe(`${SITE_DOMAIN}/recipe/x`);
  });
});

describe('seo · breadcrumbList', () => {
  it('нумерует крошки с единицы и достраивает домен', () => {
    const ld = breadcrumbList([
      { name: 'Главная', url: '/' },
      { name: 'Рецепты', url: '/recipe' },
    ]);
    expect(ld.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Главная', item: `${SITE_DOMAIN}/` },
      { '@type': 'ListItem', position: 2, name: 'Рецепты', item: `${SITE_DOMAIN}/recipe` },
    ]);
  });
});
