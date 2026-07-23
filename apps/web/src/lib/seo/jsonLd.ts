// ════════════════════════════════════════════════════════════
// Хелперы structured data (schema.org) для rich-результатов Google.
// Общий модуль, чтобы разметка на товаре, категории и рецепте не разъезжалась.
// ════════════════════════════════════════════════════════════

export const SITE_DOMAIN = 'https://microgreenuzbekistan.com';
const ORG_ID = `${SITE_DOMAIN}/#organization`;

/** Тег <script type="application/ld+json"> одной строкой для вставки в JSX. */
export function jsonLdScript(data: object): string {
  return JSON.stringify(data);
}

interface Crumb { name: string; url: string }

/** Хлебные крошки → сниппет с навигацией под заголовком в выдаче. */
export function breadcrumbList(crumbs: Crumb[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: c.url.startsWith('http') ? c.url : `${SITE_DOMAIN}${c.url}`,
    })),
  };
}

interface CollectionItem { id: string; name: string }

/** Категория как CollectionPage + ItemList товаров. */
export function collectionPage(opts: {
  name: string;
  description: string;
  url: string;
  items: CollectionItem[];
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: opts.name,
    description: opts.description,
    url: opts.url,
    isPartOf: { '@id': `${SITE_DOMAIN}/#website` },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: opts.items.length,
      itemListElement: opts.items.map((it, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE_DOMAIN}/product/${it.id}`,
        name: it.name,
      })),
    },
  };
}

interface RecipeSchemaInput {
  slug: string;
  name: string;
  description: string;
  image: string | null;
  cookMinutes: number | null;
  servings: number | null;
  ingredients: { nameRu: string; amount: string | null }[];
  steps: { textRu: string; image: string | null }[];
}

/** schema.org/Recipe — карточка рецепта с фото и шагами в выдаче. */
export function recipeSchema(r: RecipeSchemaInput) {
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: r.name,
    description: r.description,
    url: `${SITE_DOMAIN}/recipe/${r.slug}`,
    author: { '@type': 'Organization', name: 'Microgreen Uzbekistan', '@id': ORG_ID },
    // Микрозелень — сквозная тема бренда, поэтому фиксируем ключевые слова
    keywords: 'микрозелень, рецепт, ЗОЖ, ПП, здоровое питание, mikroko‘kat',
    recipeCategory: 'Healthy',
    recipeCuisine: 'Uzbek',
  };
  if (r.image) data.image = r.image.startsWith('http') ? r.image : `${SITE_DOMAIN}${r.image}`;
  if (r.cookMinutes) data.totalTime = `PT${r.cookMinutes}M`;
  if (r.servings) data.recipeYield = `${r.servings}`;
  if (r.ingredients.length) {
    data.recipeIngredient = r.ingredients.map((i) => (i.amount ? `${i.nameRu} — ${i.amount}` : i.nameRu));
  }
  if (r.steps.length) {
    data.recipeInstructions = r.steps.map((s, i) => {
      const step: Record<string, unknown> = { '@type': 'HowToStep', position: i + 1, text: s.textRu };
      if (s.image) step.image = s.image.startsWith('http') ? s.image : `${SITE_DOMAIN}${s.image}`;
      return step;
    });
  }
  return data;
}
