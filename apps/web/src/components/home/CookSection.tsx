'use client';

import Link from 'next/link';
import { ChefHat, ArrowRight } from 'lucide-react';

import { useLang } from '@/components/providers/LangProvider';
import { RecipeCard } from '@/components/recipe/RecipeCard';
import type { RecipeCardView } from '@/lib/recipes';

// ══════════════════════════════════════════════════════════════════════
// «Что приготовить» — три блюда и переход к нужной зелени.
//
// ЧТО БЫЛО ВМЕСТО. Блок «Рецепт дня» показывал рецепт, СГЕНЕРИРОВАННЫЙ
// моделью на лету (`/api/ai/nutrition?type=recipe`). Он менялся при каждой
// загрузке, не вёл ни к одному товару и не совпадал ни с чем в журнале.
// При этом в базе лежат настоящие рецепты, у которых ингредиенты УЖЕ
// связаны с товарами (`RecipeIngredient.productId`) — то есть готовый путь
// «блюдо → зелень → корзина» просто не был подключён к главной.
//
// ДАННЫЕ ПРИХОДЯТ С СЕРВЕРА ПРОПСОМ, а не загружаются здесь: ссылки на
// рецепты попадают в исходный HTML, и их видит поисковый робот. Прежний
// блок рисовался только после ответа модели, поэтому для краулера его не
// существовало вовсе.
//
// Сам компонент клиентский РАДИ ЯЗЫКА. Главная переключается между
// русским и узбекским целиком, и блок с жёстко вписанным русским
// заголовком стоял бы посреди узбекской страницы — ровно тот разнобой,
// на который указал владелец.
//
// Пустой список — блок исчезает. Заголовок «Что приготовить» над пустотой
// обещает то, чего нет.
// ══════════════════════════════════════════════════════════════════════

/** Сколько блюд показываем на главной. Три — ряд на десктопе и лента на телефоне. */
export const COOK_LIMIT = 3;

export function CookSection({ recipes }: { recipes: RecipeCardView[] }) {
  const { t } = useLang();
  const shown = recipes.slice(0, COOK_LIMIT);
  if (shown.length === 0) return null;

  return (
    <section className="container" style={{ padding: 'var(--space-8) 0' }} id="cook-section">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-5)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 200 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              fontWeight: 600,
            }}
          >
            <ChefHat size={14} /> {t("Bizning ko'katimiz bilan", 'Блюда с нашей зеленью')}
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 'var(--font-extrabold)',
              fontSize: 'clamp(1.4rem, 3.5vw, 2rem)',
              marginTop: 4,
            }}
          >
            {t('Nima pishirish kerak', 'Что приготовить')}
          </h2>
        </div>

        <Link
          href="/recipe"
          className="btn btn-ghost btn-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          {t('Barcha retseptlar', 'Все рецепты')} <ArrowRight size={15} />
        </Link>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 'var(--space-4)',
        }}
      >
        {shown.map((recipe) => (
          <RecipeCard key={recipe.slug} recipe={recipe} />
        ))}
      </div>
    </section>
  );
}
