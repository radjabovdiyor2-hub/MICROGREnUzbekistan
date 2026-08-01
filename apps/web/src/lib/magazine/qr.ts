// ════════════════════════════════════════════════════════════
// QR для семейного блока (конверсия в продажи).
// MVP: сервис-генератор без npm-зависимости (сборка self-contained по коду).
// Заменяется на локальную либу `qrcode` (data URL, офлайн-печать) сменой
// одной функции buildQrUrl — остальной код не трогается.
// ════════════════════════════════════════════════════════════

import QRCode from 'qrcode';

const SITE = process.env.NEXT_PUBLIC_URL || 'https://microgreenuzbekistan.com';

// Ссылка, которую кодирует QR: страница промокода ресторана
export function promoUrl(promoCode: string): string {
  return `${SITE}/promo/${encodeURIComponent(promoCode)}`;
}

// Витрина ресторана: меню + кадры гостей
export function menuUrl(slug: string): string {
  return `${SITE}/m/${encodeURIComponent(slug)}`;
}

// Страница блюда. Адрес намеренно короткий — этот QR печатается
// размером ~15 мм, и каждый лишний символ уплотняет модули.
export function dishUrl(slug: string, code: number): string {
  return `${SITE}/m/${encodeURIComponent(slug)}/d/${code}`;
}

// Страница рецепта (QR в журнале ведёт на веб-рецепт + «собрать набор»)
export function recipeUrl(slug: string): string {
  return `${SITE}/recipe/${encodeURIComponent(slug)}`;
}

// URL картинки QR-кода для данных (экранное превью, margin:0)
// Чистые чёрный и белый ниже — требование считывания, а не оформление:
// сканеру нужен максимальный контраст модулей, поэтому токен темы тут не
// применяется ни на экране, ни в печати.
export async function buildQrUrl(data: string, size = 300): Promise<string> {
  return await QRCode.toDataURL(data, {
    width: size,
    margin: 0,
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  });
}

// ── QR для печати ──
// Журнал верстается во внешнем редакторе, поэтому QR отдаём файлами.
// margin:4 (тихая зона по стандарту) и коррекция 'M' — чтобы код читался
// с матовой бумаги; без тихой зоны сканер часто не находит код.
const PRINT_OPTS = { margin: 4, errorCorrectionLevel: 'M' as const, color: { dark: '#000000', light: '#ffffff' } };

// PNG печатного качества (растровый макет)
export async function qrPng(data: string, size = 1024): Promise<Buffer> {
  return await QRCode.toBuffer(data, { ...PRINT_OPTS, width: size, type: 'png' });
}

// SVG-вектор (InDesign/Canva без пикселизации при любом размере)
export async function qrSvg(data: string): Promise<string> {
  return await QRCode.toString(data, { ...PRINT_OPTS, type: 'svg' });
}
