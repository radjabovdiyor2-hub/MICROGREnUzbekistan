import type { FeedItem, FeedLang } from './items';

// ══════════════════════════════════════════════════════════════════════
// Фид для агентских витрин (ChatGPT, Perplexity и прочие покупающие ИИ).
//
// Форма взята из Agentic Commerce Protocol: мерчант отдаёт регулярно
// обновляемый фид (CSV или JSON) с идентификатором, ценой, наличием,
// медиа и условиями доставки, а покупка завершается у мерчанта. Свой
// Instant Checkout OpenAI свернул в марте 2026 — остался именно фид, и
// это единственная часть протокола, которая нужна с нашей стороны.
//
// Отдельного «фида для ИИ» у Google нет: его подборки берут товар из
// Merchant Center. Поэтому здесь ровно то, чего в RSS-фиде не выразить, —
// количество, единица цены и обещание срока доставки.
// ══════════════════════════════════════════════════════════════════════

interface AgentProduct {
  id: string;
  title: string;
  description: string;
  link: string;
  image_link: string;
  additional_image_links: string[];
  price: { amount: number; currency: 'UZS' };
  /** Цена до скидки — null, если скидки нет. */
  list_price: number | null;
  availability: 'in_stock' | 'out_of_stock';
  inventory_quantity: number;
  brand: string;
  mpn: string | null;
  category: string;
  /** За что назначена цена: «лоток», «100 г», «кг». */
  price_unit: string;
  shipping: { country: 'UZ'; price: number; promise_minutes: string };
}

export interface AgentFeed {
  merchant: {
    name: string;
    url: string;
    currency: 'UZS';
    locale: FeedLang;
  };
  /** Момент сборки — по нему агент понимает, свежие ли данные. */
  generated_at: string;
  products: AgentProduct[];
}

export function renderAgentFeed(items: FeedItem[], lang: FeedLang, now: Date = new Date()): AgentFeed {
  return {
    merchant: {
      name: 'Microgreen Uzbekistan',
      url: 'https://microgreenuzbekistan.com',
      currency: 'UZS',
      locale: lang,
    },
    generated_at: now.toISOString(),
    products: items.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      link: item.link,
      image_link: item.imageLink,
      additional_image_links: item.additionalImages,
      price: { amount: item.price, currency: 'UZS' },
      list_price: item.oldPrice,
      availability: item.available ? 'in_stock' : 'out_of_stock',
      inventory_quantity: item.quantity,
      brand: item.brand,
      mpn: item.mpn,
      category: item.productType,
      price_unit: item.unit,
      shipping: {
        country: 'UZ',
        price: item.shippingPrice,
        promise_minutes: item.shippingPromise,
      },
    })),
  };
}
