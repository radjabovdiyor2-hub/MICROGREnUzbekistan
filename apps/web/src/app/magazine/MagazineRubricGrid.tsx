import Link from 'next/link';
import { RUBRICS, RECIPE_RUBRIC } from '@/lib/magazine/rubrics';

// Рубрики — главная навигация журнала. Счётчик под названием честный: он
// показывает, сколько там уже есть, и пустая рубрика видна как пустая, а
// не обещает содержимое за карточкой.
export function MagazineRubricGrid({ counts, recipeCount }: {
  counts: Record<string, number>;
  recipeCount: number;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: 16,
      }}
    >
      {RUBRICS.map((r) => {
        const count = r.id === RECIPE_RUBRIC ? recipeCount : (counts[r.id] ?? 0);
        return (
          <Link
            key={r.id}
            href={`/magazine/${r.id}`}
            style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 18, padding: 20, textDecoration: 'none',
              display: 'flex', flexDirection: 'column', gap: 6,
            }}
          >
            <span style={{ fontSize: 26 }}>{r.emoji}</span>
            <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>{r.ru}</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{r.uz}</span>
            <span style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--text-secondary)', marginTop: 4 }}>
              {r.taglineRu}
            </span>
            <span style={{ fontSize: 12, color: 'var(--brand-primary)', fontWeight: 600, marginTop: 6 }}>
              {count > 0 ? `материалов: ${count}` : 'скоро'}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
