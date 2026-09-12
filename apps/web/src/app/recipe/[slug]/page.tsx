import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { loadRecipeBySlug, recipeCartProducts, listRecipes, type RecipeCardView } from '@/lib/recipes';
import { RecipeCard } from '@/components/recipe/RecipeCard';
import { RecipeTracker } from '@/components/recipe/RecipeTracker';
import { RecipeBody } from '@/components/recipe/RecipeBody';
import { RecipeIngredientsSection } from '@/components/recipe/RecipeIngredientsSection';
import { jsonLdScript, recipeSchema, breadcrumbList, SITE_DOMAIN } from '@/lib/seo/jsonLd';

// Страница рецепта — куда ведёт QR из журнала. Текст рецепта наполняется
// в админке; ключевая механика — «собрать набор микрозелени» в корзину.
export const dynamic = 'force-dynamic';

const ACCENT = 'var(--brand-primary)';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const r = await loadRecipeBySlug(slug);
  if (!r) return { title: 'Рецепт' };
  const url = `${SITE_DOMAIN}/recipe/${slug}`;
  const description = r.descriptionRu
    || `${r.titleRu} — рецепт с микрозеленью${r.cookMinutes ? ` за ${r.cookMinutes} минут` : ''}. ЗОЖ, ПП, здоровое питание от Microgreen Uzbekistan.`;
  const image = r.heroImage ? (r.heroImage.startsWith('http') ? r.heroImage : `${SITE_DOMAIN}${r.heroImage}`) : `${SITE_DOMAIN}/hero-microgreens.png`;
  return {
    title: r.titleRu,
    description,
    keywords: [r.titleRu, r.titleUz || '', 'рецепт с микрозеленью', 'ЗОЖ рецепт', 'ПП рецепт', 'здоровое питание', "mikroko'kat retsept"].filter(Boolean),
    alternates: { canonical: url },
    openGraph: {
      title: r.titleRu,
      description,
      url,
      type: 'article',
      siteName: 'Microgreen Uzbekistan',
      locale: 'ru_RU',
      images: [{ url: image, width: 1200, height: 900, alt: r.titleRu }],
    },
    twitter: { card: 'summary_large_image', title: r.titleRu, description, images: [image] },
  };
}

export default async function RecipePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const recipe = await loadRecipeBySlug(slug);
  if (!recipe) notFound();

  const ld = [
    recipeSchema({
      slug,
      name: recipe.titleRu,
      description: recipe.descriptionRu || `${recipe.titleRu} — рецепт с микрозеленью`,
      image: recipe.heroImage,
      cookMinutes: recipe.cookMinutes,
      servings: recipe.servings,
      ingredients: recipe.ingredients.map((i) => ({ nameRu: i.nameRu, amount: i.amount })),
      steps: recipe.steps.map((s) => ({ textRu: s.textRu, image: s.image })),
    }),
    breadcrumbList([
      { name: 'Главная', url: '/' },
      { name: 'Рецепты', url: '/recipe' },
      { name: recipe.titleRu, url: `/recipe/${slug}` },
    ]),
  ];

  // Другие рецепты — внутренние ссылки между карточками раздела
  let others: RecipeCardView[] = [];
  try {
    others = (await listRecipes()).filter((r) => r.slug !== slug).slice(0, 4);
  } catch {
    /* БД недоступна — блок не показываем */
  }

  const cartProducts = recipeCartProducts(recipe);
  // Минуты и порции считает `RecipeBody`: единицы у них тоже переводятся,
  // и держать вторую копию здесь значило бы однажды их развести.

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '90px 16px 60px' }}>
      {ld.map((data, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }} />
      ))}
      <RecipeTracker slug={slug} />
      <div style={{ maxWidth: 640, margin: '0 auto' }}>

        {/* Крошки: заодно вход в хаб рецептов из каждой карточки */}
        <nav aria-label="breadcrumb" style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--text-muted, var(--text-muted))', marginBottom: 14 }}>
          <Link href="/" style={{ color: 'inherit' }}>Главная</Link>
          {' / '}
          <Link href="/recipe" style={{ color: 'inherit' }}>Рецепты</Link>
        </nav>

        {recipe.heroImage && (
          <img
            src={recipe.heroImage}
            alt={recipe.titleRu}
            style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 20, marginBottom: 16 }}
          />
        )}

        <RecipeBody
          titleRu={recipe.titleRu}
          titleUz={recipe.titleUz}
          descriptionRu={recipe.descriptionRu}
          descriptionUz={recipe.descriptionUz}
          cookMinutes={recipe.cookMinutes}
          servings={recipe.servings}
          steps={recipe.steps}
          accent={ACCENT}
        />

        {/* Ингредиенты + сбор набора */}
        <RecipeIngredientsSection
          ingredients={recipe.ingredients}
          cartProducts={cartProducts}
          slug={slug}
          accent={ACCENT}
        />

        {others.length > 0 && (
          <section style={{ marginTop: 40 }}>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 14 }}>
              Другие рецепты
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 12,
            }}>
              {others.map((r) => <RecipeCard key={r.slug} recipe={r} />)}
            </div>
            <Link
              href="/recipe"
              style={{
                display: 'inline-block', marginTop: 16,
                fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 700,
                color: ACCENT, textDecoration: 'none',
              }}
            >
              Все рецепты →
            </Link>
          </section>
        )}
      </div>
    </div>
  );
}
