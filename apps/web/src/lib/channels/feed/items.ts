import { prisma } from '@repo/database';

import { getNumber, getSetting } from '@/lib/settings/store';
import { SITE_DOMAIN } from '@/lib/seo/jsonLd';

import { availabilityFor, type ChannelPolicy } from '../availability';
import { taxonomyFor } from '../taxonomy';

// ══════════════════════════════════════════════════════════════════════
// Позиции товарного фида — один проход по каталогу на все форматы.
//
// Google Merchant, агентские витрины и каталог Meta просят одни и те же
// сведения в разной упаковке. Собираем их здесь один раз: иначе три
// сборщика разойдутся в цене или наличии, и площадки будут показывать
// разное про один лоток.
// ══════════════════════════════════════════════════════════════════════

export type FeedLang = 'uz' | 'ru';

export interface FeedItem {
  id: string;
  title: string;
  description: string;
  link: string;
  imageLink: string;
  additionalImages: string[];
  /** Цена канала в сумах, целое. */
  price: number;
  /** Цена до скидки — только если она выше текущей. */
  oldPrice: number | null;
  available: boolean;
  quantity: number;
  brand: string;
  /** Артикул. Пусто — товар заведён без него. */
  mpn: string | null;
  googleCategory?: string;
  productType: string;
  /** Единица, за которую назначена цена: «лоток», «100 г», «кг». */
  unit: string;
  shippingPrice: number;
  /** Обещание доставки для агентских витрин, например «30-90». */
  shippingPromise: string;
}

/** Ссылка на карточку с языковым префиксом — тем же, что в карте сайта. */
function productLink(id: string, lang: FeedLang): string {
  return lang === 'uz' ? `${SITE_DOMAIN}/product/${id}` : `${SITE_DOMAIN}/${lang}/product/${id}`;
}

function absolute(url: string): string {
  return url.startsWith('http') ? url : `${SITE_DOMAIN}${url.startsWith('/') ? '' : '/'}${url}`;
}

/**
 * Описание для фида.
 *
 * Пустое описание — причина отклонения позиции в Merchant, поэтому у
 * товара без текста собираем его из того, что точно есть: название,
 * категория и единица. Придумывать свойства товара нельзя.
 */
function describe(
  name: string,
  own: string | null,
  categoryName: string | null,
  unit: string,
  lang: FeedLang,
): string {
  const text = own?.trim();
  if (text) return text;
  return lang === 'uz'
    ? `${name} — ${categoryName ?? "Microgreen Uzbekistan"}. Narx ${unit} uchun. Buyurtma kuni kesiladi.`
    : `${name} — ${categoryName ?? 'Microgreen Uzbekistan'}. Цена за ${unit}. Срезка в день заказа.`;
}

/**
 * Собрать позиции фида для канала.
 *
 * Выключенный канал отдаёт пустой список, а не весь каталог: это и есть
 * рубильник владельца на экране «Каналы».
 */
export async function buildFeedItems(
  policy: ChannelPolicy,
  lang: FeedLang,
  now: Date = new Date(),
): Promise<FeedItem[]> {
  if (!policy.isActive) return [];

  const [products, shippingPrice, promise] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        nameUz: true,
        nameRu: true,
        descriptionUz: true,
        descriptionRu: true,
        price: true,
        oldPrice: true,
        stock: true,
        images: true,
        sku: true,
        brand: true,
        unit: true,
        category: { select: { slug: true, nameUz: true, nameRu: true } },
      },
      orderBy: { updatedAt: 'desc' },
    }),
    getNumber('delivery.fee'),
    getSetting('delivery.timePromise'),
  ]);

  const items: FeedItem[] = [];

  for (const p of products) {
    // Позиция без картинки в Merchant отклоняется целиком — не отдаём её
    // и не тратим на неё квоту проверок.
    const images = p.images.filter(Boolean);
    if (images.length === 0) continue;

    const state = availabilityFor(
      {
        id: p.id,
        price: p.price,
        stock: Number(p.stock),
        categorySlug: p.category?.slug ?? null,
        isActive: true,
      },
      policy,
      now,
    );

    const tax = taxonomyFor(p.category?.slug ?? null);
    const name = lang === 'uz' ? p.nameUz : p.nameRu;
    const categoryName = lang === 'uz' ? p.category?.nameUz : p.category?.nameRu;
    const own = lang === 'uz' ? p.descriptionUz : p.descriptionRu;

    items.push({
      id: p.id,
      title: name,
      description: describe(name, own, categoryName ?? null, p.unit, lang),
      link: productLink(p.id, lang),
      imageLink: absolute(images[0]),
      additionalImages: images.slice(1, 11).map(absolute),
      // Недоступную позицию отдаём по цене каталога: цена канала считается
      // от наценки и без неё поле осталось бы пустым, а Merchant требует
      // цену даже у `out_of_stock`.
      price: state.available ? state.price : p.price,
      oldPrice: p.oldPrice && p.oldPrice > p.price ? p.oldPrice : null,
      available: state.available,
      quantity: state.available ? state.quantity : 0,
      brand: p.brand || 'Microgreen Uzbekistan',
      mpn: p.sku,
      googleCategory: tax.googleCategory,
      productType: tax.productType,
      unit: p.unit,
      shippingPrice,
      shippingPromise: promise,
    });
  }

  return items;
}
