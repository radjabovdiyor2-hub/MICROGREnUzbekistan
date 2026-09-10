import Link from 'next/link';

import type { DishWithGreens } from '@/lib/recipes';

// ══════════════════════════════════════════════════════════════════════
// «Как это выглядит в блюдах» — последний из шести вопросов закупщика.
//
// ЗАЧЕМ ШЕФУ ЭТОТ БЛОК. Список культур и фасовок отвечает на вопрос «что у
// вас есть», но не на «что мне с этим делать». Микрозелень покупают не
// потому, что она свежая, а потому, что она решает задачу на тарелке:
// вкус, цвет, подача. Блюдо показывает это за секунду, список — нет.
//
// БЕРЁМ НАСТОЯЩИЕ РЕЦЕПТЫ, а не картинки из стока: у каждого блюда
// названа зелень, которая в нём используется, и её можно купить. Блюдо
// без продаваемой зелени сюда не попадает — оно ничего не говорит о нашем
// товаре.
// ══════════════════════════════════════════════════════════════════════

/** Три блюда: ряд на десктопе, лента на телефоне. Больше — уже каталог. */
const SHOWN = 3;

export function B2bDishes({ dishes }: { dishes: DishWithGreens[] }) {
  const shown = dishes.slice(0, SHOWN);
  if (shown.length === 0) return null;

  return (
    <section style={{ marginTop: 'var(--space-8)' }}>
      <h2 style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-xl)' }}>
        Как это выглядит в блюдах
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginTop: 4 }}>
        Taomlarda qanday ko&apos;rinadi
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 'var(--space-4)',
          marginTop: 'var(--space-4)',
        }}
      >
        {shown.map((d) => (
          <Link
            key={d.slug}
            href={`/recipe/${d.slug}`}
            className="card"
            style={{
              padding: 0,
              overflow: 'hidden',
              textDecoration: 'none',
              color: 'inherit',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {d.heroImage && (
              <img
                src={d.heroImage}
                alt={d.titleRu}
                loading="lazy"
                style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block' }}
              />
            )}
            <div style={{ padding: 'var(--space-4)' }}>
              <div style={{ fontWeight: 'var(--font-semibold)' }}>{d.titleRu}</div>
              {/* Названа именно наша зелень: закупщик должен увидеть свой
                  будущий заказ, а не абстрактное «микрозелень». */}
              <div
                style={{
                  fontSize: 'var(--text-sm)',
                  color: 'var(--text-secondary)',
                  marginTop: 6,
                  lineHeight: 1.5,
                }}
              >
                {d.greens.map((g) => g.nameRu).join(', ')}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
