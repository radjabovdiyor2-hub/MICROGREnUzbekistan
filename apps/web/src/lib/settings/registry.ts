// ══════════════════════════════════════════════════════════════════════
// Реестр бизнес-настроек — единственное место, где объявлено, ЧЕМ
// владелец может управлять из админки.
//
// До него правила бизнеса были константами в коде: цена доставки в
// lib/site.ts, суммы рефералов в api/referral, пороги склада в
// api/inventory. Поменять их можно было только правкой файла и деплоем.
//
// Дефолты здесь — ровно те значения, что работали раньше. Таблица
// app_settings хранит ТОЛЬКО изменённое, поэтому до первого сохранения
// поведение системы не меняется ни на йоту.
//
// Добавляя ключ: объявите его здесь, и он сам появится в UI настроек —
// форма строится из реестра, руками её править не нужно.
// ══════════════════════════════════════════════════════════════════════

import { DELIVERY, CONTACT } from '@/lib/site';

export type SettingType = 'number' | 'money' | 'string' | 'text' | 'boolean' | 'list';

export interface SettingDef {
  /** Группа во вкладке настроек. */
  category: SettingCategory;
  type: SettingType;
  default: number | string | boolean | string[];
  labelRu: string;
  labelUz: string;
  /** Короткое пояснение: что сломается, если поставить не то. */
  hintRu?: string;
  min?: number;
  max?: number;
  /** Настройка уходит в публичный /api/config (сайт + магазинный бот). */
  publicKey?: boolean;
}

export const SETTING_CATEGORIES = [
  'delivery',
  'contacts',
  'content',
  'bonus',
  'loyalty',
  'stock',
  'payment',
  'ai',
  'magazine',
] as const;

export type SettingCategory = (typeof SETTING_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<SettingCategory, { ru: string; uz: string }> = {
  delivery: { ru: 'Доставка', uz: 'Yetkazib berish' },
  contacts: { ru: 'Контакты и соцсети', uz: 'Kontaktlar' },
  content: { ru: 'Тексты на сайте', uz: 'Sayt matnlari' },
  bonus: { ru: 'Бонусы и рефералы', uz: 'Bonuslar' },
  loyalty: { ru: 'Лояльность HoReCa', uz: 'HoReCa sodiqlik' },
  stock: { ru: 'Склад и пороги', uz: 'Ombor' },
  payment: { ru: 'Оплата', uz: "To'lov" },
  ai: { ru: 'ИИ и бюджет', uz: 'AI va byudjet' },
  magazine: { ru: 'Журнал и печать', uz: 'Jurnal' },
};

export const SETTINGS = {
  // ── Доставка ────────────────────────────────────────────────────────
  // Раньше: lib/site.ts DELIVERY (as const, без чтения env), плюс своя
  // копия DELIVERY_FEE = 25000 в sales_bot/handlers/order.py.
  'delivery.fee': {
    category: 'delivery', type: 'money', default: DELIVERY.fee, publicKey: true,
    labelRu: 'Стоимость доставки', labelUz: 'Yetkazib berish narxi',
    hintRu: 'Плоский тариф ниже порога бесплатной доставки', min: 0,
  },
  'delivery.freeThreshold': {
    category: 'delivery', type: 'money', default: DELIVERY.freeThreshold, publicKey: true,
    labelRu: 'Бесплатно от суммы', labelUz: 'Bepul yetkazish summasi',
    hintRu: 'Заказ на эту сумму и выше — доставка бесплатна', min: 0,
  },
  'delivery.timePromise': {
    category: 'delivery', type: 'string', default: '30-90', publicKey: true,
    labelRu: 'Обещанное время (мин)', labelUz: 'Yetkazish vaqti (daq)',
    hintRu: 'Показывается на сайте и в карточке товара',
  },

  // ── Контакты ────────────────────────────────────────────────────────
  'contacts.phonePrimary': {
    category: 'contacts', type: 'string', default: CONTACT.phonePrimary, publicKey: true,
    labelRu: 'Основной телефон', labelUz: 'Asosiy telefon',
    hintRu: 'Используется на сайте, в боте и в промптах ИИ',
  },
  'contacts.phoneSecondary': {
    category: 'contacts', type: 'string', default: CONTACT.phoneSecondary, publicKey: true,
    labelRu: 'Второй телефон', labelUz: 'Ikkinchi telefon',
  },
  'contacts.email': {
    category: 'contacts', type: 'string', default: 'hello@microgreenuzbekistan.com', publicKey: true,
    labelRu: 'E-mail', labelUz: 'E-mail',
  },
  'contacts.address': {
    category: 'contacts', type: 'string', default: 'Samarqand, Ray Center', publicKey: true,
    labelRu: 'Адрес магазина', labelUz: "Do'kon manzili",
  },
  'contacts.instagramUrl': {
    category: 'contacts', type: 'string', default: CONTACT.instagramUrl, publicKey: true,
    labelRu: 'Instagram', labelUz: 'Instagram',
  },
  'contacts.telegramChannelUrl': {
    category: 'contacts', type: 'string', default: CONTACT.telegramChannelUrl, publicKey: true,
    labelRu: 'Telegram-канал', labelUz: 'Telegram kanal',
  },
  'contacts.telegramBotUrl': {
    category: 'contacts', type: 'string', default: CONTACT.telegramBotUrl, publicKey: true,
    labelRu: 'Telegram-бот', labelUz: 'Telegram bot',
  },
  'contacts.whatsappUrl': {
    category: 'contacts', type: 'string', default: CONTACT.whatsappUrl, publicKey: true,
    labelRu: 'WhatsApp', labelUz: 'WhatsApp',
  },

  // ── Тексты на сайте ─────────────────────────────────────────────────
  // bannerEnabled/bannerText раньше были жёстко false/'' в api/config —
  // владелец физически не мог включить баннер.
  'content.heroTitle': {
    category: 'content', type: 'string', default: 'Microgreen Uzbekistan', publicKey: true,
    labelRu: 'Заголовок на главной', labelUz: 'Bosh sahifa sarlavhasi',
  },
  'content.heroSubtitle': {
    category: 'content', type: 'string', default: 'Mikrozelen • Gidroponika • Sog‘lom hayot', publicKey: true,
    labelRu: 'Подзаголовок', labelUz: 'Kichik sarlavha',
  },
  'content.bannerEnabled': {
    category: 'content', type: 'boolean', default: false, publicKey: true,
    labelRu: 'Показывать баннер', labelUz: 'Bannerni ko\'rsatish',
    hintRu: 'Полоса-объявление вверху сайта и в боте',
  },
  'content.bannerText': {
    category: 'content', type: 'text', default: '', publicKey: true,
    labelRu: 'Текст баннера', labelUz: 'Banner matni',
  },
  'content.workHoursWeekday': {
    category: 'content', type: 'string', default: 'Пн–Сб 08:00–20:00', publicKey: true,
    labelRu: 'Часы работы (будни)', labelUz: 'Ish vaqti (dushanba-shanba)',
    hintRu: 'Только надпись на сайте: заказы принимаются круглосуточно',
  },
  'content.workHoursSunday': {
    category: 'content', type: 'string', default: 'Вс 09:00–18:00', publicKey: true,
    labelRu: 'Часы работы (воскресенье)', labelUz: 'Ish vaqti (yakshanba)',
  },

  // ── Бонусы и рефералы ───────────────────────────────────────────────
  // Раньше дублировались в api/referral, api/users/referral и api/orders.
  'bonus.referralPercent': {
    category: 'bonus', type: 'number', default: 3,
    labelRu: 'Процент с заказа реферала', labelUz: 'Referal buyurtmasidan foiz',
    hintRu: 'Сколько % от заказа получает пригласивший', min: 0, max: 100,
  },
  'bonus.referrerReward': {
    category: 'bonus', type: 'money', default: 5000,
    labelRu: 'Бонус пригласившему', labelUz: 'Taklif qilganga bonus', min: 0,
  },
  'bonus.newUserReward': {
    category: 'bonus', type: 'money', default: 2000,
    labelRu: 'Бонус новому клиенту', labelUz: 'Yangi mijozga bonus', min: 0,
  },
  'bonus.minCashout': {
    category: 'bonus', type: 'money', default: 50000,
    labelRu: 'Минимум для списания бонусов', labelUz: 'Minimal yechish summasi',
    hintRu: 'Раньше значение показывали клиенту, но НЕ проверяли при заказе', min: 0,
  },

  // ── Лояльность HoReCa ───────────────────────────────────────────────
  'loyalty.goal': {
    category: 'loyalty', type: 'number', default: 5,
    labelRu: 'Штампов до награды', labelUz: 'Mukofotgacha shtamplar', min: 1, max: 50,
  },
  'loyalty.rewardPercent': {
    category: 'loyalty', type: 'number', default: 15,
    labelRu: 'Размер награды (%)', labelUz: 'Mukofot (%)', min: 0, max: 100,
  },
  'loyalty.rewardValidDays': {
    category: 'loyalty', type: 'number', default: 30,
    labelRu: 'Срок действия награды (дней)', labelUz: 'Amal qilish muddati (kun)', min: 1,
  },

  // ── Склад ───────────────────────────────────────────────────────────
  'stock.criticalLevel': {
    category: 'stock', type: 'number', default: 2,
    labelRu: 'Критический остаток', labelUz: 'Kritik qoldiq',
    hintRu: 'Ниже или равно — статус CRITICAL и красный флаг в отчётах', min: 0,
  },
  'stock.lowStockAlert': {
    category: 'stock', type: 'number', default: 5,
    labelRu: 'Порог уведомления в Telegram', labelUz: 'Telegram ogohlantirish chegarasi', min: 0,
  },
  'stock.lowDaysOfSupply': {
    category: 'stock', type: 'number', default: 14,
    labelRu: 'Мало запаса (дней продаж)', labelUz: 'Kam zaxira (kun)', min: 1,
  },
  'stock.excessMultiplier': {
    category: 'stock', type: 'number', default: 3,
    labelRu: 'Избыток: месячных продаж ×', labelUz: 'Ortiqcha: oylik sotuv ×', min: 1,
  },
  'stock.reorderLeadDays': {
    category: 'stock', type: 'number', default: 14,
    labelRu: 'Точка дозаказа (дней)', labelUz: 'Qayta buyurtma (kun)',
    hintRu: 'Срок поставки + страховой запас', min: 1,
  },
  'stock.demandWindowDays': {
    category: 'stock', type: 'number', default: 90,
    labelRu: 'Окно расчёта спроса (дней)', labelUz: 'Talab oynasi (kun)', min: 7,
  },

  // ── Оплата ──────────────────────────────────────────────────────────
  'payment.methods': {
    category: 'payment', type: 'list', default: ['cash', 'click', 'payme'], publicKey: true,
    labelRu: 'Способы оплаты', labelUz: "To'lov usullari",
    hintRu: 'Порядок влияет на порядок в корзине. Пустой список сломает оформление',
  },

  // ── ИИ ──────────────────────────────────────────────────────────────
  'ai.dailyBudgetUsd': {
    category: 'ai', type: 'number', default: 5,
    labelRu: 'Дневной бюджет ИИ ($)', labelUz: 'Kunlik AI byudjeti ($)', min: 0,
  },
  'ai.monthlyBudgetUsd': {
    category: 'ai', type: 'number', default: 100,
    labelRu: 'Месячный бюджет ИИ ($)', labelUz: 'Oylik AI byudjeti ($)', min: 0,
  },
  'ai.usdUzsRate': {
    category: 'ai', type: 'number', default: 12600,
    labelRu: 'Курс USD → UZS', labelUz: 'USD → UZS kursi',
    hintRu: 'Для пересчёта расходов на ИИ в P&L', min: 1,
  },

  // ── Журнал ──────────────────────────────────────────────────────────
  'magazine.printUnitCost': {
    category: 'magazine', type: 'money', default: 4000,
    labelRu: 'Себестоимость экземпляра', labelUz: 'Bir nusxa tannarxi', min: 0,
  },
} as const satisfies Record<string, SettingDef>;

export type SettingKey = keyof typeof SETTINGS;

/** Значения по умолчанию — то, как система вела себя до появления настроек. */
export function defaultSettings(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(SETTINGS)) {
    out[key] = (def as SettingDef).default;
  }
  return out;
}

export const PUBLIC_SETTING_KEYS: string[] = Object.entries(SETTINGS)
  .filter(([, def]) => (def as SettingDef).publicKey)
  .map(([key]) => key);

/**
 * Приводит присланное значение к типу настройки и проверяет границы.
 * Возвращает { ok:false }, если значение непригодно — вызывающий обязан
 * отказать, а не записывать мусор: настройки читает и сайт, и боты.
 */
export function coerceSetting(
  key: string,
  raw: unknown,
): { ok: true; value: number | string | boolean | string[] } | { ok: false; error: string } {
  const def = (SETTINGS as Record<string, SettingDef>)[key];
  if (!def) return { ok: false, error: `Неизвестная настройка: ${key}` };

  switch (def.type) {
    case 'number':
    case 'money': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/\s/g, ''));
      if (!Number.isFinite(n)) return { ok: false, error: 'Ожидается число' };
      if (def.min !== undefined && n < def.min) return { ok: false, error: `Минимум ${def.min}` };
      if (def.max !== undefined && n > def.max) return { ok: false, error: `Максимум ${def.max}` };
      return { ok: true, value: n };
    }
    case 'boolean':
      return { ok: true, value: raw === true || raw === 'true' };
    case 'list': {
      const arr = Array.isArray(raw)
        ? raw.map(v => String(v).trim())
        : String(raw).split(',').map(v => v.trim());
      const clean = arr.filter(Boolean);
      if (!clean.length) return { ok: false, error: 'Список не может быть пустым' };
      return { ok: true, value: clean };
    }
    case 'string':
    case 'text': {
      const s = String(raw ?? '');
      if (s.length > 2000) return { ok: false, error: 'Слишком длинное значение' };
      return { ok: true, value: s };
    }
  }
}
