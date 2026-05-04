import { MetadataRoute } from 'next';
import { prisma } from '@repo/database';

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
  ];

  // Category pages — high priority for SEO
  const categories = [
    'microgreens', 'baby-leaf', 'salads', 'flowers',
    'seeds', 'equipment', 'sets',
  ];
  const categoryPages: MetadataRoute.Sitemap = categories.map(slug => ({
    url: `${BASE}/catalog?category=${slug}`,
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: 0.85,
  }));

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

  return [...staticPages, ...categoryPages, ...productPages];
}
