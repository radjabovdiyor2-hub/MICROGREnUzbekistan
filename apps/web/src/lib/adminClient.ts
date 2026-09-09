'use client';

// ══════════════════════════════════════════════════════════════════════
// Клиентский fetch для admin-API.
//
// Раньше здесь к каждому запросу подставлялся заголовок x-admin-password,
// а сам пароль лежал в sessionStorage открытым текстом — любой XSS уносил
// его целиком и получал полный доступ к админке.
//
// Теперь авторизация держится на httpOnly-cookie: браузер отправляет её
// сам, JS её не видит и украсть её скриптом нельзя. Поэтому здесь не
// осталось ничего, кроме Content-Type.
// ══════════════════════════════════════════════════════════════════════

export function adminHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { 'Content-Type': 'application/json', ...extra };
}

export function adminFetch(url: string, init: RequestInit = {}) {
  return fetch(url, {
    ...init,
    // Cookie и так уходит на same-origin, но говорим об этом явно.
    credentials: 'same-origin',
    headers: { ...adminHeaders(), ...((init.headers as Record<string, string>) || {}) },
  });
}

/**
 * Достать из ответа массив.
 *
 * Защищает от `TypeError: x.map is not a function`, когда API вернул
 * `{error: "..."}` вместо списка.
 *
 * ПОЧЕМУ РАЗБИРАЕТ И ОБЁРТКУ. Раньше здесь стояло `Array.isArray(data)
 * ? data : []`, и ответ вида `{ employees: [...] }` превращался в пустой
 * массив МОЛЧА. Так и сломалось назначение объезда: `/api/inventory/
 * employees` отдаёт `{ employees }`, выпадающий список сотрудников был
 * пуст всегда, и назначить объезд было некому — при том, что сотрудники
 * в базе есть и на своём экране показываются.
 *
 * Заворачивать список в объект — обычная и правильная привычка (место под
 * `total`, `hasMore`), и требовать от каждого роута голый массив значило
 * бы чинить не ту сторону. Разворачиваем здесь: сам массив берём как есть,
 * а у объекта — ЕДИНСТВЕННОЕ поле-массив.
 *
 * Единственное намеренно: у `{ items, categories }` выбор был бы догадкой,
 * а догадка здесь однажды подставит не тот список. В таком случае честнее
 * вернуть пусто и сказать об этом в консоль, чем тихо показать чужое.
 */
export async function adminJsonArray<T = unknown>(url: string, init?: RequestInit): Promise<T[]> {
  try {
    const res = await adminFetch(url, init ?? {});
    if (!res.ok) return [];
    const data = await res.json();
    return pickArray<T>(data, url);
  } catch {
    return [];
  }
}

/** Массив из ответа: сам массив либо единственное поле-массив объекта. */
export function pickArray<T = unknown>(data: unknown, source = ''): T[] {
  if (Array.isArray(data)) return data as T[];
  if (typeof data !== 'object' || data === null) return [];

  const arrays = Object.values(data as Record<string, unknown>).filter(Array.isArray);
  if (arrays.length === 1) return arrays[0] as T[];

  if (arrays.length > 1) {
    console.warn(`[adminJsonArray] ${source}: несколько списков в ответе — какой брать, неясно`);
  }
  return [];
}
