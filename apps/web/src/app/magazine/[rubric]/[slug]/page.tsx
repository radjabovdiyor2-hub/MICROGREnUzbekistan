import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { loadArticleBySlug, listArticles } from '@/lib/magazine/content';
import { findRubric, type RubricId } from '@/lib/magazine/rubrics';
import { MagazineArticleCard } from '../../MagazineArticleCard';
import { MagazineArticleProduct } from './MagazineArticleProduct';
import { jsonLdScript, breadcrumbList, articleSchema, SITE_DOMAIN } from '@/lib/seo/jsonLd';

// Материал журнала. Текст собран секциями в админке: подзаголовок, абзац,
// картинка. Разметку в текст не пускаем вовсе — ни своей, ни чужой.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = await loadArticleBySlug(slug);
  if (!article) return { title: 'Материал не найден' };

  const url = `${SITE_DOMAIN}/magazine/${article.rubric}/${article.slug}`;
  const description = article.excerptRu || `${article.titleRu} — материал журнала FRESH WEEKLY.`;
  return {
    title: article.titleRu,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: article.titleRu,
      description,
      url,
      type: 'article',
      siteName: 'Microgreen Uzbekistan',
      locale: 'ru_RU',
      ...(article.coverImage ? { images: [{ url: article.coverImage }] } : {}),
    },
  };
}

export default async function ArticlePage({ params }: { params: Promise<{ rubric: string; slug: string }> }) {
  const { rubric, slug } = await params;
  const article = await loadArticleBySlug(slug);
  // Материал открывается только по адресу своей рубрики: иначе один и тот
  // же текст доступен по шести адресам и поиск делит его вес между ними.
  if (!article || article.rubric !== rubric) notFound();

  const r = findRubric(article.rubric);
  if (!r) notFound();

  const others = (await listArticles(article.rubric as RubricId, 4)).filter((a) => a.slug !== slug).slice(0, 3);

  const ld = [
    breadcrumbList([
      { name: 'Главная', url: '/' },
      { name: 'FRESH WEEKLY', url: '/magazine' },
      { name: r.ru, url: `/magazine/${r.id}` },
      { name: article.titleRu, url: `/magazine/${r.id}/${article.slug}` },
    ]),
    articleSchema({
      url: `/magazine/${r.id}/${article.slug}`,
      headline: article.titleRu,
      description: article.excerptRu,
      image: article.coverImage,
      publishedAt: article.publishedAt,
      section: r.ru,
    }),
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '90px 16px 60px' }}>
      {ld.map((data, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }} />
      ))}

      <article style={{ maxWidth: 680, margin: '0 auto' }}>
        <nav aria-label="breadcrumb" style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
          <Link href="/magazine" style={{ color: 'inherit' }}>FRESH WEEKLY</Link>
          {' / '}
          <Link href={`/magazine/${r.id}`} style={{ color: 'inherit' }}>{r.ru}</Link>
        </nav>

        {article.coverImage && (
          <img
            src={article.coverImage}
            alt={article.titleRu}
            style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 20, marginBottom: 18 }}
          />
        )}

        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--brand-primary)' }}>
          {r.emoji} {r.ru}
        </div>

        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(28px, 7vw, 40px)', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.1, marginTop: 10 }}>
          {article.titleRu}
        </h1>
        {article.titleUz && (
          <div style={{ fontSize: 16, color: 'var(--text-muted)', marginTop: 6 }}>{article.titleUz}</div>
        )}
        {article.excerptRu && (
          <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--text-secondary)', marginTop: 14 }}>
            {article.excerptRu}
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, marginTop: 28 }}>
          {article.sections.map((s) => (
            <section key={s.id}>
              {s.headingRu && (
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 21, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
                  {s.headingRu}
                </h2>
              )}
              {s.image && (
                <img src={s.image} alt="" style={{ width: '100%', borderRadius: 14, marginBottom: 10, objectFit: 'cover' }} />
              )}
              <p style={{ fontSize: 16, lineHeight: 1.7, color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}>
                {s.textRu}
              </p>
              {s.textUz && (
                <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--text-muted)', whiteSpace: 'pre-line', marginTop: 10 }}>
                  {s.textUz}
                </p>
              )}
            </section>
          ))}
        </div>

        {article.product && <MagazineArticleProduct product={article.product} />}

        {article.issue?.webUrl && (
          <a
            href={article.issue.webUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block', marginTop: 28, padding: 18, borderRadius: 16,
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              textDecoration: 'none', color: 'var(--text-primary)',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--brand-primary)' }}>
              Из номера №{article.issue.number}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>
              {article.issue.titleRu} — читать весь номер →
            </div>
          </a>
        )}

        {others.length > 0 && (
          <section style={{ marginTop: 40 }}>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 14 }}>
              Ещё в рубрике «{r.ru}»
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
              {others.map((a) => <MagazineArticleCard key={a.slug} article={a} />)}
            </div>
          </section>
        )}
      </article>
    </div>
  );
}
