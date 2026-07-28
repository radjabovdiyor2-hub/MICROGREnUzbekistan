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

// Parse response as JSON array; return [] on non-ok status or non-array body.
// Prevents `TypeError: x.map is not a function` when API returns {error: "..."}.
export async function adminJsonArray(url: string, init?: RequestInit): Promise<any[]> {
  try {
    const res = await adminFetch(url, init ?? {});
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
