import type { Metadata } from 'next';
import { prisma } from '@repo/database';
import { ProductPageClient } from './ProductPageClient';
import { ProductGrowLive } from './ProductGrowLive';
import { PUBLIC_PRODUCT_SELECT } from '@/lib/products/fields';
import type { Product as PublicProduct } from './productDetailTypes';
import { recipesForProduct, type RecipeCardView } from '@/lib/recipes';
import { RecipeCard } from '@/components/recipe/RecipeCard';
import { jsonLdScript } from '@/lib/seo/jsonLd';

const DOMAIN = 'https://microgreenuzbekistan.com';

// Server-side metadata generation for SEO
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  
  try {
    const product = await prisma.product.findUnique({
      where: { id },
      include: { category: true },
    });

    if (!product) {
      return { title: "Mahsulot topilmadi" };
    }

    const title = `${product.nameUz} — ${product.nameRu} | Microgreen Uzbekistan`;
    const description = product.descriptionUz 
      || `${product.nameUz} (${product.nameRu}) — narxi ${product.price.toLocaleString('ru-RU')} so'm. Samarqandda yetkazib berish. Organik, yangi, sifatli.`;
    const image = product.images?.[0] || `${DOMAIN}/hero-microgreens.png`;
    const url = `${DOMAIN}/product/${id}`;

    return {
      title: product.nameUz,
      description,
      keywords: [
        product.nameUz, product.nameRu,
        product.category?.nameUz || '', product.category?.nameRu || '',
        product.brand || '',
        "mikroko'katlar", "mikrozelen", "organik", "Samarqand",
        "микрозелень", "купить", "доставка",
      ].filter(Boolean),
      alternates: {
        canonical: url,
      },
      openGraph: {
        title,
        description,
        type: 'website',
        url,
        images: [{ url: image, width: 800, height: 800, alt: product.nameUz }],
        siteName: 'Microgreen Uzbekistan',
        locale: 'uz_UZ',
        alternateLocale: ['ru_RU'],
      },
      twitter: {
        card: 'summary_large_image',
        title: product.nameUz,
        description,
        images: [image],
      },
    };
  } catch {
    return { title: "Mahsulot" };
  }
}

// Server component — renders JSON-LD + client component
export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Fetch product server-side for JSON-LD (SEO structured data)
  //
  // Этот же результат уезжает в клиентский компонент пропсом. Раньше товар
  // запрашивался ТРИЖДЫ за один просмотр: здесь, в generateMetadata и ещё раз
  // с браузера через `/api/products?id=`. Третий запрос стоил посетителю
  // полного круга до сервера уже ПОСЛЕ того, как страница отрисовалась.
  //
  // `select`, а не `include`: набор полей берётся из `PUBLIC_PRODUCT_SELECT`,
  // и это не косметика. `include` тянул строку целиком, вместе с `costPrice`;
  // отдать её в пропсах клиентского компонента значит впечатать закупочную
  // цену в HTML, который читает кто угодно. Ровно от этого и написан
  // `lib/products/fields.ts`.
  let jsonLd = null;
  let breadcrumb = null;
  let initialProduct: PublicProduct | null = null;
  try {
    const product = await prisma.product.findUnique({
      where: { id },
      select: {
        ...PUBLIC_PRODUCT_SELECT,
        // Latest reviews with text — rendered as schema.org Review for rich snippets
        reviews: {
          where: { comment: { not: null } },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: { user: { select: { firstName: true } } },
        },
      },
    });

    if (product) {
      const { reviews: _reviews, ...card } = product;
      initialProduct = card as PublicProduct;

      const image = product.images?.[0] || `${DOMAIN}/hero-microgreens.png`;
      jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.nameUz,
        description: product.descriptionUz || product.descriptionRu || `${product.nameUz} — organik mahsulot`,
        image,
        url: `${DOMAIN}/product/${id}`,
        brand: {
          '@type': 'Brand',
          name: product.brand || 'Microgreen Uzbekistan',
        },
        category: product.category?.nameUz || "Mikroko'katlar",
        offers: {
          '@type': 'Offer',
          price: product.price,
          priceCurrency: 'UZS',
          availability: product.stock > 0
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
          seller: {
            '@type': 'Organization',
            name: 'Microgreen Uzbekistan',
          },
          url: `${DOMAIN}/product/${id}`,
        },
        ...(product.rating > 0 ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: product.rating,
            reviewCount: product.reviewCount || 1,
            bestRating: 5,
            worstRating: 1,
          },
        } : {}),
        ...(product.reviews.length > 0 ? {
          review: product.reviews.map((r) => ({
            '@type': 'Review',
            reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 },
            author: { '@type': 'Person', name: r.user?.firstName || 'Покупатель' },
            reviewBody: r.comment,
            datePublished: r.createdAt.toISOString().slice(0, 10),
          })),
        } : {}),
      };

      // Хлебные крошки: Главная → Каталог → Категория → Товар
      const catSlug = product.category?.slug;
      breadcrumb = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Главная', item: DOMAIN },
          { '@type': 'ListItem', position: 2, name: 'Каталог', item: `${DOMAIN}/catalog` },
          ...(catSlug ? [{ '@type': 'ListItem', position: 3, name: product.category!.nameRu, item: `${DOMAIN}/catalog/${catSlug}` }] : []),
          { '@type': 'ListItem', position: catSlug ? 4 : 3, name: product.nameRu, item: `${DOMAIN}/product/${id}` },
        ],
      };
    }
  } catch {
    // Product will be fetched client-side anyway
  }

  // Рецепты, где товар — ингредиент. Серверный рендер: ссылки товар → рецепт
  // попадают в исходный HTML, иначе рецепты остаются без входящих ссылок.
  let recipes: RecipeCardView[] = [];
  try {
    recipes = await recipesForProduct(id);
  } catch {
    // БД недоступна — блок просто не показываем
  }

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
        />
      )}
      {breadcrumb && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumb) }}
        />
      )}
      <ProductPageClient id={id} initialProduct={initialProduct} />

      {/* Живая партия этого товара. Модуль «жизнь лотка глазами клиента»
          написан и покрыт тестом, а показывать его было негде. */}
      <ProductGrowLive productId={id} />

      {recipes.length > 0 && (
        <section className="container" style={{ paddingBottom: 'var(--space-8)' }}>
          <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-semibold)', letterSpacing: '-0.025em', marginBottom: 4 }}>
            Retseptlar bilan
          </h2>
          <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-secondary)', marginBottom: 'var(--space-6)' }}>
            Рецепты с этим товаром
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 'var(--space-3)',
          }}>
            {recipes.map((r) => <RecipeCard key={r.slug} recipe={r} />)}
          </div>
        </section>
      )}
    </>
  );
}
