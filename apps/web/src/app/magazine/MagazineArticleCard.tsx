import Link from 'next/link';
import { Bi } from '@/components/ui/Bi';
import type { ArticleCard } from '@/lib/magazine/content';
import { findRubric } from '@/lib/magazine/rubrics';

// Карточка материала. Адрес — /magazine/<рубрика>/<slug>: рубрика в пути
// говорит и читателю, и поиску, о чём страница, до её открытия.
export function MagazineArticleCard({ article }: { article: ArticleCard }) {
  const rubric = findRubric(article.rubric);

  return (
    <Link
      href={`/magazine/${article.rubric}/${article.slug}`}
      style={{
        display: 'flex', flexDirection: 'column',
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 20, overflow: 'hidden', textDecoration: 'none',
      }}
    >
      <div
        style={{
          aspectRatio: '4 / 3',
          background: 'linear-gradient(135deg, rgba(var(--brand-primary-rgb), 0.18), var(--bg-secondary))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {article.coverImage
          ? <img src={article.coverImage} alt={article.titleRu} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: 34 }}>{rubric?.emoji ?? '📄'}</span>}
      </div>

      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rubric && (
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--brand-primary)' }}>
            <Bi ru={rubric.ru} uz={rubric.uz} />
          </div>
        )}
        <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
          <Bi ru={article.titleRu} uz={article.titleUz} />
        </h3>
        {article.excerptRu && (
          <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
            <Bi ru={article.excerptRu} uz={article.excerptUz} />
          </p>
        )}
      </div>
    </Link>
  );
}
