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

// Детский хаб (для QR в детском блоке журнала)
export function kidsUrl(): string {
  return `${SITE}/magazine/kids`;
}

// URL картинки QR-кода для данных
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
