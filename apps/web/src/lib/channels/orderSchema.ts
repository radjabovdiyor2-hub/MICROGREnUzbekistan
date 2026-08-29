import { z } from 'zod';

import { quantitySchema } from '@/lib/qty';

// ══════════════════════════════════════════════════════════════════════
// Канонический заказ с площадки — контракт нашей двери.
//
// Площадки присылают заказ каждая по-своему, и превращает их тело в это
// — адаптер канала (`adapters/`). Дверь принимает только канонический вид:
// иначе разбор чужого формата расползся бы по роуту, а обновление формата
// у площадки ломало бы приём заказов молча.
// ══════════════════════════════════════════════════════════════════════

export const channelOrderItemSchema = z.object({
  /** Идентификатор товара витрины. Либо он, либо `sku`. */
  productId: z.string().optional(),
  /** Артикул — им площадки оперируют чаще, чем нашим id. */
  sku: z.string().optional(),
  quantity: quantitySchema,
  /**
   * Цена площадки за единицу. Необязательна и на сумму заказа НЕ влияет:
   * цену ставит каталог (`lib/orders/create.ts`). Нужна, чтобы записать
   * расхождение и увидеть, что покупатель на площадке видел не наш прайс.
   */
  price: z.number().int().min(0).optional(),
});

export const channelOrderSchema = z.object({
  /** Номер заказа у площадки — ключ идемпотентности. */
  externalId: z.string().min(1).max(80),
  customer: z.object({
    name: z.string().min(1),
    phone: z.string().min(5),
    address: z.string().min(2),
    note: z.string().optional().nullable(),
  }),
  items: z.array(channelOrderItemSchema).min(1),
  city: z.string().optional(),
  /** `cash` — курьер берёт деньги, `marketplace` — площадка уже собрала. */
  paymentMethod: z.enum(['cash', 'card', 'marketplace']).optional(),
  /**
   * Площадка уже получила деньги.
   *
   * Отдельным полем, а не выводом из способа оплаты: у агрегаторов
   * доставки заказ бывает и предоплаченным, и наличными курьеру, и путать
   * их значит показывать владельцу выручку, которой ещё нет.
   */
  paid: z.boolean().optional(),
});

export type ChannelOrderInput = z.infer<typeof channelOrderSchema>;
