// ══════════════════════════════════════════════════════════════════════
// Реестр каналов продаж — один источник правды о том, что канал умеет.
//
// Строка в `sales_channels` хранит НАСТРОЙКИ канала (включён, города,
// буфер, отсечка), которые владелец меняет из админки. Здесь — его
// ПРИРОДА: код, тип, способ синхронизации и то, скоропорт ли ему можно.
// Разделение то же, что у офиса между `bot_registry.py` и настройками:
// природу правит разработчик, настройки — владелец.
//
// Канала нет в этом файле — значит, его не существует: дверь приёма
// заказов отвечает 404, а не создаёт заказ неизвестно откуда.
// ══════════════════════════════════════════════════════════════════════

/** Как площадка узнаёт о наших остатках и ценах. */
export type SyncMode =
  /** Мы шлём обновления сами (вебхук/HTTP площадки). */
  | 'api'
  /** Площадка забирает выгрузку по ссылке. */
  | 'feed'
  /** Человек грузит файл в кабинет — API у площадки нет. */
  | 'manual';

export type ChannelKind = 'feed' | 'marketplace' | 'delivery' | 'social';

export interface ChannelDef {
  code: string;
  kind: ChannelKind;
  /** Имя для админки — по-русски, его читает владелец. */
  name: string;
  syncMode: SyncMode;
  /**
   * Пускает ли площадка скоропорт.
   *
   * `false` не запрет ассортимента, а признание логистики: на складских
   * схемах лоток портится раньше, чем доедет, и отмена стоит 9% от заказа.
   * Такому каналу отдаём наборы, семена и оборудование.
   */
  allowsPerishable: boolean;
  /** Принимает ли канал заказы к нам (у фидов и соцсетей — нет). */
  acceptsOrders: boolean;
  /**
   * Что пишется в `Order.source`, когда заказ пришёл из этого канала.
   *
   * По умолчанию — сам код: дверь `POST /api/channels/<код>/orders`
   * ставит его дословно. Но заказы из Telegram появились задолго до
   * реестра, и витринный бот пишет `telegram_bot` — из-за расхождения
   * на экране «Каналы продаж» у живого канала стоял ноль заказов, и
   * выглядело это как «Telegram не продаёт», а не как «мы считаем не то».
   */
  orderSources?: readonly string[];
}

export const CHANNELS: readonly ChannelDef[] = [
  {
    code: 'google_shopping',
    kind: 'feed',
    name: 'Google Покупки',
    syncMode: 'feed',
    allowsPerishable: true,
    acceptsOrders: false,
  },
  {
    code: 'ai_agents',
    kind: 'feed',
    name: 'AI-витрины (ChatGPT, Perplexity)',
    syncMode: 'feed',
    allowsPerishable: true,
    acceptsOrders: false,
  },
  {
    code: 'meta_catalog',
    kind: 'feed',
    name: 'Каталог Meta (реклама, директ)',
    syncMode: 'feed',
    allowsPerishable: true,
    acceptsOrders: false,
  },
  {
    code: 'tezkor',
    kind: 'delivery',
    name: 'Uzum Tezkor',
    syncMode: 'api',
    allowsPerishable: true,
    acceptsOrders: true,
  },
  {
    code: 'yandex_eats',
    kind: 'delivery',
    name: 'Yandex Eats',
    syncMode: 'api',
    allowsPerishable: true,
    acceptsOrders: true,
  },
  {
    code: 'uzum',
    kind: 'marketplace',
    name: 'Uzum Market (FBS)',
    // Публичного API продавца у Uzum нет: остатки уходят выгрузкой в
    // кабинет либо через партнёрского интегратора.
    syncMode: 'manual',
    allowsPerishable: true,
    acceptsOrders: true,
  },
  {
    code: 'sello',
    kind: 'marketplace',
    name: 'Sello',
    syncMode: 'manual',
    allowsPerishable: false,
    acceptsOrders: true,
  },
  {
    code: 'olx',
    kind: 'marketplace',
    name: 'OLX',
    syncMode: 'manual',
    allowsPerishable: false,
    acceptsOrders: false,
  },
  {
    code: 'telegram',
    kind: 'social',
    name: 'Telegram-канал и группа',
    syncMode: 'manual',
    allowsPerishable: true,
    acceptsOrders: false,
    // `telegram_bot` пишет `apps/bot` (корзина и ИИ-продавец),
    // `telegram` — дверь каналов. Считаем оба.
    orderSources: ['telegram', 'telegram_bot'],
  },
  {
    code: 'instagram',
    kind: 'social',
    name: 'Instagram',
    syncMode: 'manual',
    allowsPerishable: true,
    acceptsOrders: false,
  },
] as const;

const BY_CODE = new Map(CHANNELS.map((c) => [c.code, c]));

/** Определение канала или null — неизвестный код не выдумываем. */
export function channelDef(code: string): ChannelDef | null {
  return BY_CODE.get(code) ?? null;
}

/**
 * Код канала по значению `Order.source` — или null.
 *
 * Заказы витрины (`web`), админки (`web_admin`) и офиса (`ai_office`)
 * каналу не принадлежат намеренно. Офис заводит заказ от имени клиента,
 * пришедшего откуда угодно — от звонка до директа; приписать его
 * Instagram значило бы выдумать источник, а не измерить его.
 */
export function channelForSource(source: string | null | undefined): string | null {
  if (!source) return null;
  for (const def of CHANNELS) {
    const sources = def.orderSources ?? [def.code];
    if (sources.includes(source)) return def.code;
  }
  return null;
}

/** Каналы, которым разрешено присылать нам заказы. */
export function orderAcceptingCodes(): string[] {
  return CHANNELS.filter((c) => c.acceptsOrders).map((c) => c.code);
}
