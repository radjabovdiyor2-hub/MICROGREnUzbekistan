import { NextRequest, NextResponse } from 'next/server';

import { hasLegacyCustomerSession } from '@/lib/adminAuth';
import { CUSTOMER_COOKIE, SESSION_COOKIE, sessionCookieOptions } from '@/lib/session';

// ══════════════════════════════════════════════════════════════════════
// Выход покупателя.
//
// Роута выхода для клиента не существовало вовсе. `logout()` в
// AuthProvider чистил только localStorage, а подписанная httpOnly-cookie
// на ТРИДЦАТЬ СУТОК оставалась жить: экран показывал «вы вышли», сервер
// продолжал узнавать человека, и следующий заказ с этого браузера уходил
// на тот же аккаунт. На общем или чужом телефоне это прямая утечка чужой
// истории заказов и бонусов.
//
// Гасить cookie должен сервер: она httpOnly, из JavaScript её не достать —
// в этом и был смысл флага.
//
// Проверки прав здесь нет намеренно: выход — не привилегия. Запрос без
// сессии просто ничего не гасит и отвечает тем же «ок», чтобы клиент не
// разбирал два случая там, где разницы для него нет.
// ══════════════════════════════════════════════════════════════════════

export async function DELETE(request: NextRequest) {
  const res = NextResponse.json({ ok: true });
  // maxAge 0 — просьба браузеру удалить cookie немедленно. Остальные
  // атрибуты обязаны совпадать с теми, что стояли при выдаче, иначе
  // браузер сочтёт это ДРУГОЙ cookie и оставит старую на месте.
  res.cookies.set(CUSTOMER_COOKIE, '', sessionCookieOptions(0));

  // Старую общую тоже гасим — но ТОЛЬКО если в ней покупатель. Иначе выход
  // из кабинета выбрасывал бы владельца из админки, то есть ровно та
  // болезнь, ради которой cookie и разделили.
  if (hasLegacyCustomerSession(request)) {
    res.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(0));
  }
  return res;
}
