'use client';

// Клиентский fetch для admin-API журнала: добавляет заголовок x-admin-password
// (пароль владельца сохраняется в sessionStorage при логине в /admin).

export function adminHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const pw = typeof window !== 'undefined' ? sessionStorage.getItem('Microgreen_admin_pw') || '' : '';
  return { 'Content-Type': 'application/json', 'x-admin-password': pw, ...extra };
}

export function adminFetch(url: string, init: RequestInit = {}) {
  return fetch(url, {
    ...init,
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
