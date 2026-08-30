import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { listArticles } from '@/lib/magazine/content';
import { findRubric, RECIPE_RUBRIC, type RubricId } from '@/lib/magazine/rubrics';
import { listRecipes, type RecipeCardView } from '@/lib/recipes';
import { RecipeCard } from '@/components/recipe/RecipeCard';
import { MagazineArticleCard } from '../MagazineArticleCard';
import { jsonLdScript, breadcrumbList, collectionPage, SITE_DOMAIN } from '@/lib/seo/jsonLd';

// Лента одной рубрики журнала. Рубрика рецептов наполняется моделью
// `Recipe` — у неё свои карточки и свои адреса /recipe/<slug>, которые
// напечатаны на бумаге и переезжать не могут.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ rubric: string }> }): Promise<Metadata> {
  const { rubric } = await params;
  const r = findRubric(rubric);
  if (!r) return { title: 'Рубрика не найдена' };
  return {
    title: `${r.ru} — ${r.uz}`,
    description: `${r.taglineRu}. ${r.taglineUz}.`,
    alternates: { canonical: `${SITE_DOMAIN}/magazine/${r.id}` },
    openGraph: {
      title: `${r.ru} · FRESH WEEKLY`,
      description: r.taglineRu,
      url: `${SITE_DOMAIN}/magazine/${r.id}`,
      type: 'website',
      siteName: 'Microgreen Uzbekistan',
      locale: 'uz_UZ',
      alternateLocale: ['ru_RU'],
    },
  };
}

export default async function RubricPage({ params }: { params: Promise<{ rubric: string }> }) {
  const { rubric } = await params;
  const r = findRubric(rubric);
  if (!r) notFound();

  const isRecipes = r.id === RECIPE_RUBRIC;
  const [articles, recipes] = await Promise.all([
    isRecipes ? Promise.resolve([]) : listArticles(r.id as RubricId),
    isRecipes ? listRecipes().catch((): RecipeCardView[] => []) : Promise.resolve([]),
  ]);

  const items = isRecipes
    ? recipes.map((x) => ({ url: `/recipe/${x.slug}`, name: x.titleRu }))
    : articles.map((a) => ({ url: `/magazine/${a.rubric}/${a.slug}`, name: a.titleRu }));

  const ld = [
    breadcrumbList([
      { name: 'Главная', url: '/' },
      { name: 'FRESH WEEKLY', url: '/magazine' },
      { name: r.ru, url: `/magazine/${r.id}` },
    ]),
    collectionPage({
      name: `${r.ru} — FRESH WEEKLY`,
      description: r.taglineRu,
      url: `${SITE_DOMAIN}/magazine/${r.id}`,
      items,
    }),
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '90px 20px 60px' }}>
      {ld.map((data, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }} />
      ))}

      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <nav aria-label="breadcrumb" style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
          <Link href="/" style={{ color: 'inherit' }}>Главная</Link>
          {' / '}
          <Link href="/magazine" style={{ color: 'inherit' }}>FRESH WEEKLY</Link>
          {' / '}
          <span style={{ color: 'var(--text-primary)' }}>{r.ru}</span>
        </nav>

        <header style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 34 }}>{r.emoji}</div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(30px, 6vw, 46px)', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.1, marginTop: 8 }}>
            {r.uz}
          </h1>
          <div style={{ fontSize: 17, color: 'var(--text-secondary)', marginTop: 6 }}>{r.ru}</div>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--text-muted)', maxWidth: 720, marginTop: 12 }}>
            {r.taglineUz}. {r.taglineRu}.
          </p>
        </header>

        {items.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>
            Здесь пока пусто. Загляните в{' '}
            <Link href="/magazine" style={{ color: 'var(--brand-primary)' }}>другие темы журнала</Link>.
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isRecipes ? 220 : 260}px, 1fr))`, gap: 20 }}>
            {isRecipes
              ? recipes.map((x) => <RecipeCard key={x.slug} recipe={x} />)
              : articles.map((a) => <MagazineArticleCard key={a.slug} article={a} />)}
          </div>
        )}
      </div>
    </div>
  );
}
