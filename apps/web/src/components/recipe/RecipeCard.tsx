'use client';

import Link from 'next/link';
import { Clock, Users } from 'lucide-react';
import { useLang } from '@/components/providers/LangProvider';
import type { RecipeCardView } from '@/lib/recipes';

// Карточка рецепта: хаб /recipe, блок «другие рецепты», блок рецептов на товаре.
//
// КЛИЕНТСКАЯ, И ЭТО НЕ ПОТЕРЯ ДЛЯ ПОИСКА. Ссылка и заголовок по-прежнему
// попадают в исходный HTML — клиентские компоненты Next рисует на сервере
// тоже. Без языка же карточка ставила РУССКОЕ название главным всегда, а
// узбекское — мелким серым под ним: узбекский читатель видел чужой язык
// крупно, а свой петитом.
export function RecipeCard({ recipe: r }: { recipe: RecipeCardView }) {
  const { lang } = useLang();
  // Имя на языке читателя — крупным; второе остаётся подписью, потому что
  // название набора на упаковке одно, и человек должен узнать его в обоих
  // написаниях.
  const title = lang === 'uz' ? (r.titleUz || r.titleRu) : r.titleRu;
  const second = lang === 'uz' ? (r.titleUz ? r.titleRu : null) : r.titleUz;

  const meta = [
    r.cookMinutes
      ? { icon: <Clock size={13} />, text: `${r.cookMinutes} ${lang === 'ru' ? 'мин' : 'daq'}` }
      : null,
    r.servings
      ? { icon: <Users size={13} />, text: `${r.servings} ${lang === 'ru' ? 'порц.' : 'porsiya'}` }
      : null,
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
          alt={title}
          loading="lazy"
          style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block' }}
        />
      )}
      <div style={{ padding: 'var(--space-3)' }}>
        <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, lineHeight: 1.3, marginBottom: 4 }}>
          {title}
        </div>
        {second && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 6 }}>{second}</div>
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
