// ══════════════════════════════════════════════════════════════════════
// Тарифы подписки BALANS.
//
// Тариф задаёт ТОЛЬКО скидку и рекомендованный размер корзины. Сумму по-прежнему
// считает каталог: единственный источник цен — прайс `public/catalog/price-list.html`,
// и вписать сюда «250 000 сум в месяц» значило бы завести вторую цену, которая
// разойдётся с прайсом при первой же правке.
//
// Доставка у всех тарифов еженедельная: `GreenBoxSubscription` хранит один
// `deliveryDay` и один `interval`, поэтому «три доставки в неделю» этой моделью
// невыразимо. Тарифы отличаются размером корзины, а не числом приездов.
// ══════════════════════════════════════════════════════════════════════

export interface SubscriptionPlan {
  code: string;
  nameUz: string;
  nameRu: string;
  /** Скидка на сумму состава, %. */
  discountPercent: number;
  /** Сколько упаковок в одной доставке — подсказка при сборке корзины. */
  packsPerDelivery: number;
  descriptionUz: string;
  descriptionRu: string;
}

export const SUBSCRIPTION_PLANS: Record<string, SubscriptionPlan> = {
  'balans-mini': {
    code: 'balans-mini',
    nameUz: 'BALANS Mini',
    nameRu: 'BALANS Mini',
    discountPercent: 5,
    packsPerDelivery: 2,
    descriptionUz: "Haftada bir yetkazib berish, 2 qadoq. Usulni sinab ko'rish uchun.",
    descriptionRu: 'Одна доставка в неделю, 2 упаковки. Чтобы попробовать метод.',
  },
  'balans-standart': {
    code: 'balans-standart',
    nameUz: 'BALANS Standart',
    nameRu: 'BALANS Стандарт',
    discountPercent: 10,
    packsPerDelivery: 4,
    descriptionUz: 'Haftada bir yetkazib berish, 4 qadoq. Haftaning yarmiga yetadi.',
    descriptionRu: 'Одна доставка в неделю, 4 упаковки. Хватает на половину недели.',
  },
  'balans-kunlik': {
    code: 'balans-kunlik',
    nameUz: 'BALANS Kunlik',
    nameRu: 'BALANS Ежедневный',
    discountPercent: 15,
    packsPerDelivery: 6,
    descriptionUz: 'Haftada bir yetkazib berish, 6 qadoq. Kunlik porsiya uchun.',
    descriptionRu: 'Одна доставка в неделю, 6 упаковок. Порция на каждый день.',
  },
};

export const PLAN_CODES = Object.keys(SUBSCRIPTION_PLANS);

export function getPlan(code: string | null | undefined): SubscriptionPlan | null {
  if (!code) return null;
  return SUBSCRIPTION_PLANS[code] ?? null;
}

/**
 * Итог подписки со скидкой тарифа.
 *
 * Округляем вниз до целого сума: `Order.total` и `GreenBoxSubscription.total` —
 * `Int`, дробный остаток всё равно не сохранится, а округление вверх означало бы
 * брать с клиента больше объявленного.
 */
export function applyPlanDiscount(total: number, code: string | null | undefined): number {
  const plan = getPlan(code);
  if (!plan) return total;
  return Math.floor(total * (1 - plan.discountPercent / 100));
}
