// Оформление статусов остатков. Вынесено из AdminInventory — чистые данные
// без состояния.
//
// ⚠️ Подписи двуязычные: экран написан по-русски, а статусы в нём были
// только узбекскими — «Критично» соседствовало с «Kritik» в одной таблице.

export interface StockStatus {
  labelRu: string;
  labelUz: string;
  color: string;
  bg: string;
}

export const STATUS_CONFIG: Record<string, StockStatus> = {
  CRITICAL: { labelRu: 'Критично', labelUz: 'Kritik', color: 'var(--error)', bg: 'var(--error-bg)' },
  LOW: { labelRu: 'Мало', labelUz: 'Kam', color: 'var(--warning)', bg: 'var(--warning-bg)' },
  NORMAL: { labelRu: 'Норма', labelUz: 'Normal', color: 'var(--success)', bg: 'var(--success-bg)' },
  EXCESS: { labelRu: 'Избыток', labelUz: 'Ortiqcha', color: 'var(--info)', bg: 'var(--info-bg)' },
};

/** Подпись остатка на языке экрана. */
export function stockLabel(status: string, lang: 'ru' | 'uz'): string {
  const cfg = STATUS_CONFIG[status];
  if (!cfg) return status;
  return lang === 'ru' ? cfg.labelRu : cfg.labelUz;
}
