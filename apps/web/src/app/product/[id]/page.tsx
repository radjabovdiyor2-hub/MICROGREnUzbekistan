import type { Metadata } from 'next';
import { prisma } from '@repo/database';
import { ProductPageClient } from './ProductPageClient';

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
  let jsonLd = null;
  try {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
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
    }
  } catch {
    // Product will be fetched client-side anyway
  }

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <ProductPageClient id={id} />
    </>
  );
}
