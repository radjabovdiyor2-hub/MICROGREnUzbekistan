import type { NextRequest } from 'next/server';
import { isStaff } from '@/lib/adminAuth';

// ══════════════════════════════════════════════════════════════════════
// Какие поля товара уходят наружу.
//
// `findMany`/`findUnique` вызывались без `select` и отдавали всю строку —
// вместе с `costPrice`, закупочной ценой. Публичный `GET /api/products`
// показывал её по всему прайсу, то есть точную маржу, а `?all=true` снимал
// ещё и фильтр `isActive` и открывал черновики и снятые с продажи позиции.
//
// Список ведётся явно: новое поле в схеме не утечёт само по себе, его
// придётся сюда дописать осознанно.
// ══════════════════════════════════════════════════════════════════════

export const PUBLIC_PRODUCT_SELECT = {
  id: true,
  nameUz: true,
  nameRu: true,
  slug: true,
  descriptionUz: true,
  descriptionRu: true,
  price: true,
  oldPrice: true,
  unit: true,
  images: true,
  categoryId: true,
  stock: true,
  sku: true,
  brand: true,
  specs: true,
  rating: true,
  reviewCount: true,
  isActive: true,
  isFeatured: true,
  isOnSale: true,
  viewCount: true,
  createdAt: true,
  updatedAt: true,
  category: true,
} as const;

// Себестоимость нужна админке: расчёт COGS и маржи.
export const STAFF_PRODUCT_SELECT = {
  ...PUBLIC_PRODUCT_SELECT,
  costPrice: true,
} as const;

export function productSelect(request: NextRequest) {
  return isStaff(request) ? STAFF_PRODUCT_SELECT : PUBLIC_PRODUCT_SELECT;
}
