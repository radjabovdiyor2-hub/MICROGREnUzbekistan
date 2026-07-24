import type { Metadata } from 'next';
import Link from 'next/link';
import { listRecipes, type RecipeCardView } from '@/lib/recipes';
import { RecipeCard } from '@/components/recipe/RecipeCard';
import { breadcrumbList, collectionPage, SITE_DOMAIN } from '@/lib/seo/jsonLd';

// Хаб рецептов. До него /recipe/<slug> были страницами-сиротами: лежали в
// sitemap, но ни одной внутренней ссылки на них не вело — Google такие
// краулит редко и веса не даёт. Хаб + ссылки из шапки, футера и главной
// делают раздел частью структуры сайта.
export const revalidate = 3600;

const URL = `${SITE_DOMAIN}/recipe`;
const H1_UZ = "Mikroko'kat bilan retseptlar";
const H1_RU = 'Рецепты с микрозеленью';
const INTRO_UZ =
  "Mikroko'kat — taomni bezash uchungina emas. U salat, smuzi, sendvich va garnirga vitamin va yangi ta'm qo'shadi. " +
  "Bu yerda oddiy, kundalik retseptlar: har birida tayyorlash vaqti, porsiya soni va bosqichma-bosqich ko'rsatma bor. " +
  "Kerakli mikroko'katni to'g'ridan-to'g'ri retsept sahifasidan savatga qo'shish mumkin.";
const INTRO_RU =
  'Микрозелень нужна не только для украшения тарелки — она добавляет витамины и свежий вкус салатам, смузи, ' +
  'сэндвичам и гарнирам. Здесь простые рецепты на каждый день: у каждого указано время приготовления, ' +
  'количество порций и пошаговая инструкция. Нужную микрозелень можно собрать в корзину прямо со страницы рецепта — ' +
  'доставим по Самарканду свежей срезкой.';

const DESCRIPTION =
  'Простые рецепты с микрозеленью: салаты, смузи, сэндвичи, гарниры. Время приготовления, порции, ' +
  'пошаговая инструкция. Собрать нужную микрозелень в корзину — в один клик.';

export const metadata: Metadata = {
  // Без суффикса бренда — его добавит title.template корневого layout
  title: 'Рецепты с микрозеленью — ПП и ЗОЖ блюда за 15 минут',
  description: DESCRIPTION,
  keywords: [
    'рецепты с микрозеленью', 'ПП рецепты', 'ЗОЖ рецепты', 'здоровое питание',
    'салат с микрозеленью', 'смузи с микрозеленью', 'полезные рецепты',
    "mikroko'kat retseptlar", "sog'lom taomlar", 'microgreens recipes',
  ],
  alternates: { canonical: URL },
  openGraph: {
    title: 'Рецепты с микрозеленью — ПП и ЗОЖ блюда | Microgreen Uzbekistan',
    description:
      'Простые рецепты с микрозеленью: салаты, смузи, сэндвичи, гарниры. Пошагово, с таймерами и сбором ингредиентов в корзину.',
    url: URL,
    type: 'website',
    siteName: 'Microgreen Uzbekistan',
    locale: 'uz_UZ',
    alternateLocale: ['ru_RU'],
    images: [{ url: `${SITE_DOMAIN}/hero-microgreens.png`, width: 1200, height: 630 }],
  },
};

export default async function RecipeHubPage() {
  let recipes: RecipeCardView[] = [];
  try {
    recipes = await listRecipes();
  } catch {
    /* БД недоступна — хаб остаётся с текстом, без карточек */
  }

  const ld = [
    breadcrumbList([
      { name: 'Bosh sahifa · Главная', url: '/' },
      { name: H1_RU, url: '/recipe' },
    ]),
    collectionPage({
      name: H1_RU,
      description: DESCRIPTION,
      url: URL,
      items: recipes.map((r) => ({ url: `/recipe/${r.slug}`, name: r.titleRu })),
    }),
  ];

  return (
    <>
      {ld.map((data, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
      ))}

      <section className="container" style={{ paddingTop: 'var(--space-6)' }}>
        <nav aria-label="breadcrumb" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-3)' }}>
          <Link href="/" style={{ color: 'inherit' }}>Главная</Link>
          {' / '}
          <span style={{ color: 'var(--text-primary)' }}>{H1_RU}</span>
        </nav>

        <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 800, lineHeight: 1.15, marginBottom: 'var(--space-2)' }}>
          {H1_UZ}
        </h1>
        <p style={{ fontSize: 'var(--text-lg)', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
          {H1_RU}
        </p>
        <div style={{ maxWidth: 760, color: 'var(--text-secondary)', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <p>{INTRO_UZ}</p>
          <p>{INTRO_RU}</p>
        </div>
      </section>

      <section className="container" style={{ paddingTop: 'var(--space-5)', paddingBottom: 'var(--space-8)' }}>
        {recipes.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>
            Рецепты скоро появятся. А пока — <Link href="/catalog/microgreens" style={{ color: 'var(--brand-primary)' }}>каталог микрозелени</Link>.
          </p>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 'var(--space-4)',
          }}>
            {recipes.map((r) => <RecipeCard key={r.slug} recipe={r} />)}
          </div>
        )}
      </section>
    </>
  );
}
