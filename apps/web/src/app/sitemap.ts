import { MetadataRoute } from 'next';
import { prisma } from '@repo/database';
import { CATEGORY_SLUGS } from '@/lib/seo/categories';
import { RUBRICS } from '@/lib/magazine/rubrics';

const BASE = 'https://microgreenuzbekistan.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${BASE}/catalog`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.95,
    },
    {
      url: `${BASE}/balans`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      // Поставки заведениям: страница, с которой ресторан может о себе
      // сказать. Без неё весь B2B-контур офиса работал только «наружу».
      url: `${BASE}/b2b`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.85,
    },
    {
      url: `${BASE}/cart`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.6,
    },
    {
      url: `${BASE}/profile`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: `${BASE}/favorites`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.4,
    },
    {
      url: `${BASE}/magazine`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${BASE}/recipe`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.85,
    },
  ];

  // Журнал: рубрики и материалы. Рубрики берутся из словаря, а не из базы —
  // это шесть постоянных разделов, и они индексируются даже пустыми.
  const rubricPages: MetadataRoute.Sitemap = RUBRICS.map((r) => ({
    url: `${BASE}/magazine/${r.id}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  let magazinePages: MetadataRoute.Sitemap = [];
  try {
    const { listArticleRoutes } = await import('@/lib/magazine/content');
    const articles = await listArticleRoutes();
    magazinePages = articles.map((a) => ({
      url: `${BASE}/magazine/${a.rubric}/${a.slug}`,
      lastModified: a.updatedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.75,
    }));
  } catch {
    // БД недоступна на этапе сборки — карта сайта без материалов
  }

  // Category landing pages — реальные индексируемые URL /catalog/<slug>,
  // а не query-параметры (Google их схлопывает в дубль /catalog).
  //
  // Список берётся из `CATEGORY_SLUGS` — того же источника, что предгенерация
  // страниц и кэш в middleware. Раньше он был продублирован здесь строкой и
  // включал цветы, семена, оборудование, наборы и услуги: их товары скрыты
  // импортом каталога, и в карту сайта уходили пять заведомо пустых разделов.
  const categoryPages: MetadataRoute.Sitemap = CATEGORY_SLUGS.flatMap(slug => [
    {
      url: `${BASE}/catalog/${slug}`,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 0.9,
    },
    {
      url: `${BASE}/uz/catalog/${slug}`,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 0.85,
    },
    {
      url: `${BASE}/ru/catalog/${slug}`,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 0.85,
    },
  ]);

  // Dynamic product pages — fetched from database
  let productPages: MetadataRoute.Sitemap = [];
  try {
    const products = await prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });

    productPages = products.map(product => ({
      url: `${BASE}/product/${product.id}`,
      lastModified: product.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }));
  } catch {
    // Database not available — skip dynamic pages
  }

  // Recipe pages — карточки рецептов (schema.org/Recipe) для rich-результатов
  let recipePages: MetadataRoute.Sitemap = [];
  try {
    const recipes = await prisma.recipe.findMany({
      where: { isActive: true },
      select: { slug: true, updatedAt: true },
    });
    recipePages = recipes.map((r) => ({
      url: `${BASE}/recipe/${r.slug}`,
      lastModified: r.updatedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    }));
  } catch {
    // Database not available — skip
  }

  // Restaurant menu storefronts — публичные витрины /m/<slug>
  let menuPages: MetadataRoute.Sitemap = [];
  try {
    const restaurants = await prisma.restaurant.findMany({
      where: { slug: { not: null }, isPartner: true },
      select: { slug: true, updatedAt: true },
    });
    menuPages = restaurants
      .filter((r): r is { slug: string; updatedAt: Date } => Boolean(r.slug))
      .map((r) => ({
        url: `${BASE}/m/${r.slug}`,
        lastModified: r.updatedAt,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      }));
  } catch {
    // Database not available — skip
  }

  return [
    ...staticPages, ...rubricPages, ...magazinePages, ...categoryPages,
    ...productPages, ...recipePages, ...menuPages,
  ];
}
