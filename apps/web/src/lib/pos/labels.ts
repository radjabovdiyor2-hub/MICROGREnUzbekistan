// ══════════════════════════════════════════════════════════════════════
// Подписи чека: способ оплаты и место продажи.
//
// Способ оплаты подписывался в трёх местах по-своему — тернарником в
// карточке чека, картой с эмодзи в сообщении бота, ничем в истории продаж.
// Три написания одного и того же расходятся молча: добавили способ оплаты
// в кассе — и в одном месте он «В долг», в другом «Qarz», в третьем пусто.
//
// Здесь только человеческие подписи. Сам список способов задаёт касса
// (`lib/pos/sale.ts`), и неизвестное значение мы НЕ подменяем на «наличные»:
// показать чужой способ оплаты как наличные значит соврать о деньгах.
// ══════════════════════════════════════════════════════════════════════

export type Lang = 'ru' | 'uz';

const PAYMENT: Record<string, { ru: string; uz: string }> = {
  cash: { ru: 'Наличные', uz: 'Naqd' },
  card: { ru: 'Карта', uz: 'Karta' },
  debt: { ru: 'В долг', uz: 'Qarz' },
};

/** Подпись способа оплаты. Неизвестное значение показываем как есть. */
export function paymentLabel(method: string | null | undefined, lang: Lang): string | null {
  if (!method) return null;
  return PAYMENT[method]?.[lang] ?? method;
}

const ORIGIN: Record<string, { ru: string; uz: string }> = {
  counter: { ru: 'За прилавком', uz: 'Peshtaxtada' },
  field: { ru: 'С выезда', uz: 'Chiqishda' },
};

/**
 * Где продали. `counter` возвращает null намеренно: продажа за прилавком —
 * это норма, и подписывать её значит топить в шуме единственный случай,
 * ради которого поле и заведено, — выездную продажу по карте.
 */
export function originLabel(origin: string | null | undefined, lang: Lang): string | null {
  if (!origin || origin === 'counter') return null;
  return ORIGIN[origin]?.[lang] ?? origin;
}
