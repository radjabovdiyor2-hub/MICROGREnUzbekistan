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
