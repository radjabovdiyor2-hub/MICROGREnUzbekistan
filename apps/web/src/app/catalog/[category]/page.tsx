import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@repo/database';
import { CatalogView } from '../page';
import { CATEGORY_SEO, CATEGORY_SLUGS, categoryAlternates } from '@/lib/seo/categories';
import { jsonLdScript, breadcrumbList, collectionPage, SITE_DOMAIN } from '@/lib/seo/jsonLd';

// Категорийный лендинг: настоящий индексируемый URL /catalog/<slug> вместо
// query-параметра. Уникальные метатеги и вводный текст дают странице шанс
// ранжироваться отдельно.
export const dynamic = 'force-static';
export const revalidate = 3600;

export function generateStaticParams() {
  return CATEGORY_SLUGS.map((category) => ({ category }));
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category } = await params;
  const seo = CATEGORY_SEO[category];
  if (!seo) return { title: 'Каталог' };
  const url = `${SITE_DOMAIN}/catalog/${category}`;
  return {
    title: seo.title,
    description: seo.description,
    keywords: seo.keywords,
    alternates: { canonical: url, languages: categoryAlternates(category) },
    openGraph: {
      title: seo.title,
      description: seo.description,
      url,
      type: 'website',
      siteName: 'Microgreen Uzbekistan',
      locale: 'uz_UZ',
      alternateLocale: ['ru_RU'],
      images: [{ url: `${SITE_DOMAIN}/hero-microgreens.png`, width: 1200, height: 630 }],
    },
  };
}

export default async function CategoryLandingPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const seo = CATEGORY_SEO[category];
  if (!seo) notFound();

  // Товары категории для ItemList — сборка в билд-тайме (force-static),
  // БД может быть недоступна: тогда лендинг остаётся с текстом и клиентом.
  let items: { url: string; name: string }[] = [];
  try {
    const products = await prisma.product.findMany({
      where: { isActive: true, category: { slug: category } },
      select: { id: true, nameRu: true, nameUz: true },
      orderBy: { viewCount: 'desc' },
      take: 30,
    });
    items = products.map((p) => ({ url: `/product/${p.id}`, name: p.nameRu || p.nameUz }));
  } catch { /* билд без БД — ItemList пустой */ }

  const url = `${SITE_DOMAIN}/catalog/${category}`;
  const ld = [
    breadcrumbList([
      { name: 'Bosh sahifa · Главная', url: '/' },
      { name: 'Katalog · Каталог', url: '/catalog' },
      { name: seo.h1Ru, url: `/catalog/${category}` },
    ]),
    collectionPage({ name: seo.h1Ru, description: seo.description, url, items }),
  ];

  return (
    <>
      {ld.map((data, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }} />
      ))}

      {/* SEO-шапка: индексируемый H1 и вводный текст в исходном HTML */}
      <section className="container" style={{ paddingTop: 'var(--space-6)' }}>
        <nav aria-label="breadcrumb" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-3)' }}>
          <Link href="/" style={{ color: 'inherit' }}>Главная</Link>
          {' / '}
          <Link href="/catalog" style={{ color: 'inherit' }}>Каталог</Link>
          {' / '}
          <span style={{ color: 'var(--text-primary)' }}>{seo.h1Ru}</span>
        </nav>

        <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 800, lineHeight: 1.15, marginBottom: 'var(--space-2)' }}>
          {seo.h1Uz}
        </h1>
        <p style={{ fontSize: 'var(--text-lg)', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
          {seo.h1Ru}
        </p>
        <div style={{ maxWidth: 760, color: 'var(--text-secondary)', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <p>{seo.introUz}</p>
          <p>{seo.introRu}</p>
        </div>
      </section>

      {/* Интерактивный каталог, отфильтрованный по этой категории */}
      <CatalogView initialCategory={category} />
    </>
  );
}
