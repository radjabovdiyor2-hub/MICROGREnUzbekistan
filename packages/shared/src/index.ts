// ==========================================
// Microgreen Uzbekistan — Shared Utilities
//
// Здесь остаются только чистые функции без данных о компании.
//
// Раньше файл назывался «MAHALU — Shared Constants» и объявлял BRAND другой
// компании: имя Mahalu, телефон +998997772232 и адрес «Ray senter, Hokimiyat
// yonida». Константы приехали из соседнего проекта, ими никто не пользовался
// (проверено по импортам), но лежали они на видном месте — и адрес
// «Ray senter» действительно всплыл в трёх системных промптах.
//
// Контакты и экономика доставки живут в настройках витрины и в
// `apps/web/src/lib/site.ts`. Дублировать их сюда нельзя: пакет собирается
// в бандл и правится реже, чем меняются телефоны.
// ==========================================

/** Format price with proper Uzbek thousands separator */
export function formatPrice(price: number): string {
  return price.toLocaleString('ru-RU').replace(/,/g, ' ');
}

/** Calculate discount percentage */
export function getDiscountPercent(price: number, oldPrice: number): number {
  if (!oldPrice || oldPrice <= price) return 0;
  return Math.round(((oldPrice - price) / oldPrice) * 100);
}
