import Link from 'next/link';
import { Clock, Users } from 'lucide-react';
import type { RecipeCardView } from '@/lib/recipes';

// Карточка рецепта: хаб /recipe, блок «другие рецепты», блок рецептов на товаре.
// Серверный компонент — ссылка попадает в исходный HTML и её видит краулер.
export function RecipeCard({ recipe: r }: { recipe: RecipeCardView }) {
  const meta = [
    r.cookMinutes ? { icon: <Clock size={13} />, text: `${r.cookMinutes} мин` } : null,
    r.servings ? { icon: <Users size={13} />, text: `${r.servings} порц.` } : null,
  ].filter(Boolean) as { icon: React.ReactNode; text: string }[];

  return (
    <Link
      href={`/recipe/${r.slug}`}
      style={{
        display: 'block', borderRadius: 18, overflow: 'hidden',
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        color: 'inherit', textDecoration: 'none',
      }}
    >
      {r.heroImage && (
        <img
          src={r.heroImage}
          alt={r.titleRu}
          loading="lazy"
          style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block' }}
        />
      )}
      <div style={{ padding: 'var(--space-3)' }}>
        <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, lineHeight: 1.3, marginBottom: 4 }}>
          {r.titleRu}
        </div>
        {r.titleUz && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 6 }}>{r.titleUz}</div>
        )}
        {meta.length > 0 && (
          <div style={{ display: 'flex', gap: 12, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            {meta.map((m, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{m.icon}{m.text}</span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
