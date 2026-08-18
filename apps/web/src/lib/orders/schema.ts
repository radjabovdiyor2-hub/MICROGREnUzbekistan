import { z } from 'zod';
import { quantitySchema } from '@/lib/qty';

// Схемы тела POST /api/orders. Вынесено из route.ts.

export const orderItemSchema = z.object({
  id: z.string().optional(),
  productId: z.string().optional(),
  title: z.string().optional(),
  // Необязательна и ни на что не влияет: цену позиции сервер берёт из
  // каталога (`lib/orders/create.ts`). Раньше она была обязательной и
  // попадала прямо в `order_items` — покупатель назначал сумму заказа сам.
  // Поле оставлено, потому что его всё ещё шлют витринный бот и офис.
  price: z.number().int().min(0).optional(),
  // Дробное количество разрешено: салат продаётся за килограмм, и 1.3 кг —
  // обычная позиция. Предел — два знака после запятой, столько же хранит
  // колонка `OrderItem.quantity` и зеркало `crm_order_items.quantity`.
  // Третий знак Postgres округлил бы молча, поэтому его отбиваем здесь
  // (`lib/qty#quantitySchema`), а не узнаём по расхождению сумм.
  quantity: quantitySchema,
});

export type OrderItemInput = z.infer<typeof orderItemSchema>;

export const orderSchema = z.object({
  customer: z.object({
    firstName: z.string().min(1),
    lastName: z.string().optional().nullable(),
    phone: z.string().min(5),
    address: z.string().min(2),
    note: z.string().optional().nullable(),
  }).optional(),
  items: z.array(orderItemSchema).optional(),
  paymentMethod: z.string().optional(),
  userId: z.string().optional().nullable(),
  bonusToUse: z.number().optional(),
  promoCode: z.string().optional(),
  city: z.string().optional(),
  name: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  telegramId: z.union([z.number(), z.string()]).optional(),
  source: z.string().optional(),
  // Кто оформил заказ — менеджер офиса. Принимается только от доверенного
  // вызывающего, как и договорная цена: из браузера этим полем можно было бы
  // приписать чужую продажу кому угодно.
  performedBy: z.string().max(100).optional().nullable(),
  // Заметка на верхнем уровне — формат офиса (`storefront_orders.py`).
  // Без объявления Zod её отбрасывал, и она не доезжала до `orders.note`.
  note: z.string().optional().nullable(),
});
