'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { token } from '@/lib/canvasTokens';

// ══════════════════════════════════════════════════════════════════════
// Вход владельца без пароля, когда админку открыли кнопкой из Telegram.
//
// Витринный TelegramInit сюда не достаёт: он смонтирован в лэйауте
// магазина и выдаёт сессию ПОКУПАТЕЛЯ. Здесь нужна роль владельца, и
// решает её сервер — /api/auth/telegram-admin сверяет подпись initData
// и Telegram ID со списком владельцев.
//
// В обычном браузере это полный no-op: window.Telegram.WebApp внедряет
// сам клиент Telegram, и без него не происходит ничего — владелец видит
// привычный экран пароля.
// ══════════════════════════════════════════════════════════════════════

export function AdminTelegramInit({ isAuthenticated }: { isAuthenticated: boolean }) {
  const router = useRouter();
  // Одна попытка на открытие: отказ (чужой аккаунт, не задан список
  // владельцев) не должен превращаться в бесконечный цикл запросов.
  const tried = useRef(false);

  useEffect(() => {
    const wa = window.Telegram?.WebApp;
    if (!wa?.initData || tried.current) return;
    tried.current = true;

    try {
      wa.ready?.();
      wa.expand?.();
      // Литеральный цвет намеренно: setHeaderColor уходит в нативный клиент
      // Telegram, CSS-переменные там не существуют.
      wa.setHeaderColor?.(token('brand-primary'));
      wa.setBackgroundColor?.(token('bg-primary'));
    } catch {
      /* старые клиенты Telegram — не мешает входу */
    }

    if (isAuthenticated) return;

    void (async () => {
      try {
        const res = await fetch('/api/auth/telegram-admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ initData: wa.initData }),
        });
        // Роль приходит из cookie, которую читает серверный admin/page.tsx —
        // поэтому обновляем страницу, а не поднимаем состояние на клиенте.
        if (res.ok) router.refresh();
      } catch {
        /* сети нет — остаётся обычный вход по паролю */
      }
    })();
  }, [isAuthenticated, router]);

  return null;
}
