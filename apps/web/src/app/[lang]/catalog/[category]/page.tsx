import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@repo/database';
import { CatalogView } from '../../../catalog/page';
import { CATEGORY_SEO, CATEGORY_SLUGS } from '@/lib/seo/categories';
import { breadcrumbList, collectionPage, SITE_DOMAIN } from '@/lib/seo/jsonLd';

const SUPPORTED_LANGS = ['ru', 'uz'] as const;
type Lang = (typeof SUPPORTED_LANGS)[number];

export const dynamic = 'force-static';
export const revalidate = 3600;

export function generateStaticParams() {
  const params: { lang: string; category: string }[] = [];
  for (const lang of SUPPORTED_LANGS) {
    for (const category of CATEGORY_SLUGS) {
      params.push({ lang, category });
    }
  }
  return params;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; category: string }>;
}): Promise<Metadata> {
  const { lang, category } = await params;
  if (!SUPPORTED_LANGS.includes(lang as Lang)) return {};
  const seo = CATEGORY_SEO[category];
  if (!seo) return {};

  const isRu = lang === 'ru';
  const title = isRu ? seo.title : `${seo.h1Uz} | Microgreen Uzbekistan`;
  const description = isRu ? seo.description : seo.introUz;
  const url = `${SITE_DOMAIN}/${lang}/catalog/${category}`;

  return {
    title,
    description,
    keywords: seo.keywords,
    alternates: {
      canonical: url,
      languages: {
        'uz-UZ': `${SITE_DOMAIN}/uz/catalog/${category}`,
        'ru-RU': `${SITE_DOMAIN}/ru/catalog/${category}`,
        'x-default': `${SITE_DOMAIN}/catalog/${category}`,
      },
    },
    openGraph: {
      title,
      description,
      url,
      type: 'website',
      siteName: 'Microgreen Uzbekistan',
      locale: isRu ? 'ru_RU' : 'uz_UZ',
      alternateLocale: isRu ? ['uz_UZ'] : ['ru_RU'],
      images: [{ url: `${SITE_DOMAIN}/hero-microgreens.png`, width: 1200, height: 630 }],
    },
  };
}

export default async function LocalizedCategoryPage({
  params,
}: {
  params: Promise<{ lang: string; category: string }>;
}) {
  const { lang, category } = await params;
  if (!SUPPORTED_LANGS.includes(lang as Lang)) notFound();
  const seo = CATEGORY_SEO[category];
  if (!seo) notFound();

  const isRu = lang === 'ru';
  const h1 = isRu ? seo.h1Ru : seo.h1Uz;
  const intro = isRu ? seo.introRu : seo.introUz;

  let items: { id: string; name: string }[] = [];
  try {
    const products = await prisma.product.findMany({
      where: { isActive: true, category: { slug: category } },
      select: { id: true, nameRu: true, nameUz: true },
      orderBy: { viewCount: 'desc' },
      take: 30,
    });
    items = products.map((p) => ({ id: p.id, name: isRu ? (p.nameRu || p.nameUz) : (p.nameUz || p.nameRu) }));
  } catch {
    /* database unavailable during static build */
  }

  const url = `${SITE_DOMAIN}/${lang}/catalog/${category}`;
  const ld = [
    breadcrumbList([
      { name: isRu ? 'Главная' : 'Bosh sahifa', url: '/' },
      { name: isRu ? 'Каталог' : 'Katalog', url: '/catalog' },
      { name: h1, url },
    ]),
    collectionPage({ name: h1, description: isRu ? seo.description : seo.introUz, url, items }),
  ];

  return (
    <>
      {ld.map((data, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
      ))}

      <section className="container" style={{ paddingTop: 'var(--space-6)' }}>
        <nav aria-label="breadcrumb" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-3)' }}>
          <Link href="/" style={{ color: 'inherit' }}>{isRu ? 'Главная' : 'Bosh sahifa'}</Link>
          {' / '}
          <Link href="/catalog" style={{ color: 'inherit' }}>{isRu ? 'Каталог' : 'Katalog'}</Link>
          {' / '}
          <span style={{ color: 'var(--text-primary)' }}>{h1}</span>
        </nav>

        <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 800, lineHeight: 1.15, marginBottom: 'var(--space-2)' }}>
          {h1}
        </h1>
        <div style={{ maxWidth: 760, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 'var(--space-4)' }}>
          <p>{intro}</p>
        </div>
      </section>

      <CatalogView initialCategory={category} />
    </>
  );
}
