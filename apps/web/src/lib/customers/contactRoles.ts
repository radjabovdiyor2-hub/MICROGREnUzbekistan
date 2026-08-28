// ══════════════════════════════════════════════════════════════════════
// Роли контактных лиц заведения.
//
// ЗАЧЕМ. В заведении продукт выбирает один человек, а закупку утверждает
// другой: шеф решает, подходит ли зелень к блюду, но договор и оплату
// держит управляющий или владелец. Пока роль не записана, переговоры
// уходят к тому, кто ближе, — и упираются в «мне надо согласовать».
//
// `decides` на контакте отвечает на вопрос «с кем разговаривать о цене»,
// а роль — «о чём с ним разговаривать».
// ══════════════════════════════════════════════════════════════════════

export const CONTACT_ROLES = ['chef', 'manager', 'owner', 'purchaser', 'other'] as const;

export type ContactRole = (typeof CONTACT_ROLES)[number];

export const CONTACT_ROLE_LABELS: Record<ContactRole, { ru: string; uz: string }> = {
  chef: { ru: 'Шеф-повар', uz: 'Oshpaz' },
  manager: { ru: 'Управляющий', uz: 'Menejer' },
  owner: { ru: 'Владелец', uz: 'Egasi' },
  purchaser: { ru: 'Закупщик', uz: "Ta'minotchi" },
  other: { ru: 'Другое', uz: 'Boshqa' },
};

export function isContactRole(value: unknown): value is ContactRole {
  return typeof value === 'string' && (CONTACT_ROLES as readonly string[]).includes(value);
}

/** Человеческое название роли; неизвестную показываем как есть. */
export function contactRoleLabel(role: string): string {
  return isContactRole(role) ? CONTACT_ROLE_LABELS[role].ru : role;
}

/**
 * Кто в заведении утверждает закупку.
 *
 * Если явного решающего не отмечено, разговаривать разумнее с владельцем
 * или управляющим — но это ДОГАДКА, и она отмечена как догадка. Пустой
 * ответ честнее подстановки первого попавшегося имени.
 */
export function decisionMaker<T extends { role: string; decides: boolean }>(
  contacts: T[],
): { contact: T; certain: boolean } | null {
  const explicit = contacts.find((c) => c.decides);
  if (explicit) return { contact: explicit, certain: true };

  const guess = contacts.find((c) => c.role === 'owner') ?? contacts.find((c) => c.role === 'manager');
  return guess ? { contact: guess, certain: false } : null;
}
