'use client';

import { useEffect } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';

// Foundation for running the storefront as a Telegram Mini App.
// When opened inside Telegram, `window.Telegram.WebApp` is injected by the
// client: we signal ready(), expand to full height and brand the header/bg.
// Complete no-op in a normal browser (WebApp / initData absent).
//
// Next step (needs the Telegram runtime + BOT_TOKEN to verify): validate
// WebApp.initData server-side (HMAC-SHA256 with the bot token) and auto-login
// the Telegram user via AuthProvider.
export function TelegramInit() {
  const { webAppLogin, isLoggedIn } = useAuth();

  useEffect(() => {
    const wa = window.Telegram?.WebApp;
    if (!wa || !wa.initData) return; // not inside Telegram
    try {
      wa.ready?.();
      wa.expand?.();
      // Литеральный цвет намеренно: setHeaderColor уходит в нативный клиент
      // Telegram, CSS-переменные там не существуют. Держать в паре с --brand-primary.
      wa.setHeaderColor?.('#10B981');
      wa.setBackgroundColor?.('#ffffff');
    } catch {
      /* older Telegram clients — ignore */
    }
    // Securely log the Telegram user in (server validates initData via HMAC).
    if (!isLoggedIn) void webAppLogin(wa.initData);
  }, [webAppLogin, isLoggedIn]);

  return null;
}
