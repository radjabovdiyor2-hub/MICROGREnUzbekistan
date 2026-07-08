'use client';

import { useEffect } from 'react';

// Foundation for running the storefront as a Telegram Mini App.
// When opened inside Telegram, `window.Telegram.WebApp` is injected by the
// client: we signal ready(), expand to full height and brand the header/bg.
// Complete no-op in a normal browser (WebApp / initData absent).
//
// Next step (needs the Telegram runtime + BOT_TOKEN to verify): validate
// WebApp.initData server-side (HMAC-SHA256 with the bot token) and auto-login
// the Telegram user via AuthProvider.
export function TelegramInit() {
  useEffect(() => {
    const wa = (window as unknown as { Telegram?: { WebApp?: any } })?.Telegram?.WebApp;
    if (!wa || !wa.initData) return; // not inside Telegram
    try {
      wa.ready();
      wa.expand();
      wa.setHeaderColor?.('#10B981');
      wa.setBackgroundColor?.('#ffffff');
    } catch {
      /* older Telegram clients — ignore */
    }
  }, []);

  return null;
}
