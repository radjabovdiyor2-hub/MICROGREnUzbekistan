import Link from 'next/link';
import { RUBRICS, RECIPE_RUBRIC } from '@/lib/magazine/rubrics';

// Рубрики — навигация журнала. Счётчик под названием честный: он
// показывает, сколько там уже есть, и пустая рубрика видна как пустая.
//
// ПУСТАЯ РУБРИКА — НЕ ССЫЛКА. Раньше карточка вела в раздел независимо от
// содержимого и писала «скоро». Нажатие открывало пустую страницу: «скоро»
// звучит как обещание, а не как предупреждение, и человек шёл проверять.
// Теперь такая карточка не кликается и говорит прямо — материалов пока нет.
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
        const empty = count === 0;
        // Один набор стилей на оба случая: пустая карточка отличается
        // только приглушённостью, иначе сетка распадётся на два вида.
        const box: React.CSSProperties = {
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderRadius: 18, padding: 20, textDecoration: 'none',
          display: 'flex', flexDirection: 'column', gap: 6,
          opacity: empty ? 0.55 : 1,
        };
        const inner = (
          <>
            <span style={{ fontSize: 26 }}>{r.emoji}</span>
            <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>{r.ru}</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{r.uz}</span>
            <span style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--text-secondary)', marginTop: 4 }}>
              {r.taglineRu}
            </span>
            <span
              style={{
                fontSize: 12,
                color: empty ? 'var(--text-muted)' : 'var(--brand-primary)',
                fontWeight: 600,
                marginTop: 6,
              }}
            >
              {empty ? 'материалов пока нет' : `материалов: ${count}`}
            </span>
          </>
        );

        if (empty) {
          return <div key={r.id} style={box}>{inner}</div>;
        }
        return (
          <Link key={r.id} href={`/magazine/${r.id}`} style={box}>
            {inner}
          </Link>
        );
      })}
    </div>
  );
}
