import React from 'react';
import '@/styles/magazine-print.css';
import type { Block, RestaurantBrand } from '@/lib/magazine/types';
import { SECTION_TITLES } from '@/lib/magazine/types';
import * as B from './blocks';

interface Props {
  blocks: Block[];
  brand: RestaurantBrand;
  weekNumber: number;
  qrDataUrl?: string;
  kidsQrDataUrl?: string;
}

/**
 * Единый движок рендера: превращает упорядоченный список блоков в журнал.
 * Один и тот же компонент используется для веб-читалки и печатного PDF.
 * Фирменные цвета ресторана переопределяют --accent / --gold через inline-переменные.
 */
export function MagazineDocument({ blocks, brand, weekNumber, qrDataUrl, kidsQrDataUrl }: Props) {
  const weekLabel = `№${weekNumber}`;

  // Нумерация страниц и содержание
  const paged = blocks.map((b, i) => ({ block: b, page: i + 1 }));
  const tocEntries = paged
    .filter(({ block }) => block.type !== 'cover' && block.type !== 'toc')
    .map(({ block, page }) => ({
      letter: (SECTION_TITLES[block.type] || '•').charAt(0).toUpperCase(),
      title: SECTION_TITLES[block.type] || block.type,
      page,
    }));

  const rootStyle = {
    ...(brand.brandPrimary ? { ['--accent']: brand.brandPrimary } : {}),
    ...(brand.brandAccent ? { ['--gold']: brand.brandAccent } : {}),
  } as React.CSSProperties;

  return (
    <div className="mag-doc" style={rootStyle}>
      {paged.map(({ block, page }) => {
        switch (block.type) {
          case 'cover':
            return <B.CoverPage key={block.id} b={block} weekLabel={weekLabel} />;
          case 'toc':
            return <B.TocPage key={block.id} b={block} entries={tocEntries} n={page} weekLabel={weekLabel} />;
          case 'chefWord':
            return <B.ChefWordPage key={block.id} b={block} n={page} />;
          case 'restaurantOfWeek':
            return <B.RestaurantOfWeekPage key={block.id} b={block} n={page} />;
          case 'newsDigest':
            return <B.NewsDigestPage key={block.id} b={block} n={page} />;
          case 'healthTrends':
          case 'beautyTrends':
            return <B.TrendAnalyticsPage key={block.id} b={block} n={page} />;
          case 'recipe':
            return <B.RecipePage key={block.id} b={block} n={page} />;
          case 'kitchenLifehacks':
          case 'bakingDesserts':
            return <B.ListPage key={block.id} b={block} n={page} />;
          case 'nutritionist':
            return <B.NutritionistPage key={block.id} b={block} n={page} />;
          case 'techDigest':
            return <B.TechDigestPage key={block.id} b={block} n={page} />;
          case 'fitness':
            return <B.FitnessPage key={block.id} b={block} n={page} />;
          case 'kids':
            return <B.KidsPage key={block.id} b={block} n={page} kidsQrDataUrl={kidsQrDataUrl} />;
          case 'kidsCatalog':
            return <B.KidsCatalogPage key={block.id} b={block} n={page} />;
          case 'familyConversion':
            return <B.FamilyConversionPage key={block.id} b={block} brand={brand} qrDataUrl={qrDataUrl} n={page} />;
          case 'collectionAR':
            return <B.CollectionArPage key={block.id} b={block} n={page} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
