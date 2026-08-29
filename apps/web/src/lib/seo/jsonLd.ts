// ════════════════════════════════════════════════════════════
// Хелперы structured data (schema.org) для rich-результатов Google.
// Общий модуль, чтобы разметка на товаре, категории и рецепте не разъезжалась.
// ════════════════════════════════════════════════════════════

export const SITE_DOMAIN = 'https://microgreenuzbekistan.com';
const ORG_ID = `${SITE_DOMAIN}/#organization`;

/**
 * Тег <script type="application/ld+json"> одной строкой для вставки в JSX.
 *
 * Экранирование обязательно: JSON.stringify не трогает '<', поэтому строка
 *   </script><script>…</script>
 * внутри любого поля разрывала тег и выполнялась как код. Дотянуться до
 * этого можно было через отзыв к товару — имя гостя и текст отзыва
 * попадают в schema.org Review, а отзывы принимаются без авторизации.
 * CSP не помогала: в ней стоит 'unsafe-inline'.
 *
 * \uXXXX остаётся тем же символом для JSON-парсера, но тег им не закрыть.
 */
export function jsonLdScript(data: object): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
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

/** Позиция списка: URL строит вызывающий — товары, рецепты и прочее. */
interface CollectionItem { url: string; name: string }

/** Раздел как CollectionPage + ItemList его страниц. */
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
        url: it.url.startsWith('http') ? it.url : `${SITE_DOMAIN}${it.url}`,
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

/**
 * `OfferShippingDetails` — стоимость и срок доставки в разметке товара.
 *
 * Без него Google собирает карточку товара без строки доставки, а именно
 * она отличает местный магазин от заграничного в товарной выдаче и в
 * подборках ИИ-поиска. Числа — из настроек витрины, теми же значениями
 * считается доставка в корзине и уходит в товарный фид: третьего места,
 * где они живут, быть не должно.
 *
 * Здесь только те свойства, что существуют в schema.org. Порог бесплатной
 * доставки в разметку не попадает: подходящего поля у `OfferShippingDetails`
 * нет, а выдуманное Google молча игнорирует — то есть в коде оно есть, а в
 * выдаче его нет, и это худший вид «сделано».
 *
 * Политику возврата тоже НЕ заявляем: возврат срезанной зелени — вопрос к
 * владельцу, а не к разработчику. Разметка — публичное обещание.
 */
export function offerShippingDetails(opts: {
  fee: number;
  /** Обещание срока из настроек, например «30-90» (минуты). */
  promiseMinutes: string;
}) {
  const [minRaw] = opts.promiseMinutes.split('-');
  // Сроки Google принимает в ДНЯХ. Доставка за час — это ноль дней в
  // обработке и не больше суток в пути; час округлять до суток нельзя,
  // иначе местный магазин выглядит как склад в другой стране.
  const knownPromise = Number.isFinite(Number(minRaw));

  return {
    '@type': 'OfferShippingDetails',
    shippingRate: {
      '@type': 'MonetaryAmount',
      value: opts.fee,
      currency: 'UZS',
    },
    shippingDestination: {
      '@type': 'DefinedRegion',
      addressCountry: 'UZ',
    },
    ...(knownPromise
      ? {
          deliveryTime: {
            '@type': 'ShippingDeliveryTime',
            handlingTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: 0, unitCode: 'DAY' },
            transitTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: 1, unitCode: 'DAY' },
          },
        }
      : {}),
  };
}

/**
 * `MerchantReturnPolicy` — публичное обещание о возврате.
 *
 * Google просит его у товарной карточки, но заявлять его без решения
 * владельца нельзя: разметка читается как оферта. Поэтому источник —
 * настройка `delivery.returnDays`, и ноль означает «ничего не обещаем»:
 * функция возвращает `null`, поле в разметку не попадает вовсе.
 *
 * Пустое поле хуже отсутствующего только на вид: отсутствие Google
 * трактует как «политика не указана», а неверный срок — как нарушенное
 * обещание, с которым приходит покупатель.
 */
export function merchantReturnPolicy(returnDays: number) {
  if (!Number.isFinite(returnDays) || returnDays <= 0) return null;
  return {
    '@type': 'MerchantReturnPolicy',
    applicableCountry: 'UZ',
    returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
    merchantReturnDays: Math.trunc(returnDays),
    returnMethod: 'https://schema.org/ReturnByMail',
    returnFees: 'https://schema.org/FreeReturn',
  };
}
