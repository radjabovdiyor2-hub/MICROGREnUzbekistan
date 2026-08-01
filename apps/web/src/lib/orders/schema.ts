import { z } from 'zod';

// Схемы тела POST /api/orders. Вынесено из route.ts.

export const orderItemSchema = z.object({
  id: z.string().optional(),
  productId: z.string().optional(),
  title: z.string().optional(),
  price: z.number().min(0),
  quantity: z.number().min(1),
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
  bonusToUse: z.union([z.number(), z.string()]).optional(),
  promoCode: z.string().optional().nullable(),
  name: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  telegramId: z.union([z.number(), z.string(), z.bigint()]).optional(),
});
