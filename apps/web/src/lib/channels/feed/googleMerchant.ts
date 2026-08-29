import type { FeedItem, FeedLang } from './items';

// ══════════════════════════════════════════════════════════════════════
// Фид Google Merchant Center — RSS 2.0 с пространством имён `g:`.
//
// Узбекистан у Google поддержан полностью: и платные объявления, и
// бесплатные карточки. Из того же фида товар попадает в Shopping Graph, а
// значит в товарные подборки AI-поиска — отдельного «фида для ИИ» Google
// не просит.
// ══════════════════════════════════════════════════════════════════════

const CURRENCY = 'UZS';

/**
 * Экранирование для XML.
 *
 * Название товара приходит из админки, описание — из базы: любой `&` или
 * `<` в тексте рвёт документ, и Merchant отвергает ВЕСЬ фид, а не одну
 * позицию. Та же причина, по которой экранируется JSON-LD в `lib/seo`.
 */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Обрезать до длины, на которой Merchant перестаёт принимать поле. */
function clamp(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

function itemXml(item: FeedItem): string {
  const parts: string[] = [
    `<g:id>${esc(item.id)}</g:id>`,
    `<g:title>${esc(clamp(item.title, 150))}</g:title>`,
    `<g:description>${esc(clamp(item.description, 5000))}</g:description>`,
    `<g:link>${esc(item.link)}</g:link>`,
    `<g:image_link>${esc(item.imageLink)}</g:image_link>`,
    `<g:availability>${item.available ? 'in_stock' : 'out_of_stock'}</g:availability>`,
    `<g:price>${item.price} ${CURRENCY}</g:price>`,
    `<g:brand>${esc(clamp(item.brand, 70))}</g:brand>`,
    `<g:condition>new</g:condition>`,
    `<g:product_type>${esc(item.productType)}</g:product_type>`,
    // Штрихкода у лотка микрозелени не существует. Без явного
    // `identifier_exists: false` Merchant ждёт GTIN и ограничивает показы.
    `<g:identifier_exists>false</g:identifier_exists>`,
    `<g:shipping><g:country>UZ</g:country><g:price>${item.shippingPrice} ${CURRENCY}</g:price></g:shipping>`,
  ];

  for (const extra of item.additionalImages) {
    parts.push(`<g:additional_image_link>${esc(extra)}</g:additional_image_link>`);
  }
  if (item.oldPrice) {
    parts.push(`<g:sale_price>${item.price} ${CURRENCY}</g:sale_price>`);
  }
  if (item.mpn) parts.push(`<g:mpn>${esc(item.mpn)}</g:mpn>`);
  if (item.googleCategory) {
    parts.push(`<g:google_product_category>${esc(item.googleCategory)}</g:google_product_category>`);
  }
  if (item.available) {
    parts.push(`<g:quantity>${item.quantity}</g:quantity>`);
  }
  // Единица измерения важна ровно по той же причине, что и на витрине:
  // «200 000 сум» без «за кг» читается как цена за один кочан.
  parts.push(`<g:unit_pricing_base_measure>${esc(item.unit)}</g:unit_pricing_base_measure>`);

  return `    <item>\n      ${parts.join('\n      ')}\n    </item>`;
}

export function renderGoogleMerchant(items: FeedItem[], lang: FeedLang): string {
  const title =
    lang === 'uz'
      ? 'Microgreen Uzbekistan — mahsulotlar'
      : 'Microgreen Uzbekistan — каталог товаров';
  const body = items.map(itemXml).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${esc(title)}</title>
    <link>https://microgreenuzbekistan.com</link>
    <description>${esc(title)}</description>
${body}
  </channel>
</rss>
`;
}
