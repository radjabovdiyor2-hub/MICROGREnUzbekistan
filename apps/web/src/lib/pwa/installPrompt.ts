'use client';

import { useCallback, useEffect, useState } from 'react';

// ══════════════════════════════════════════════════════════════════════
// Установка приложения: одно событие на всю страницу.
//
// ПОЧЕМУ ОБЩИЙ МОДУЛЬ, А НЕ ХУК С СОБСТВЕННЫМ СЛУШАТЕЛЕМ.
// `beforeinstallprompt` браузер выдаёт РОВНО ОДИН РАЗ за загрузку
// страницы. Пока предложение было одно — плавающий тост, — это было
// незаметно. Как только их стало два (тост и строка в контактах), два
// независимых слушателя поймали бы одно и то же событие, и `prompt()` у
// второго упал бы: браузер разрешает показать системное окно однажды.
//
// Поэтому событие ловится здесь, на уровне модуля, до всякой отрисовки, а
// компоненты подписываются на результат. Кто первым нажмёт — тот и
// покажет окно; остальные сразу узнают, что предлагать больше нечего.
// ══════════════════════════════════════════════════════════════════════

// Тип `BeforeInstallPromptEvent` объявлен глобально в `types/telegram.d.ts`
// (его нет в стандартной библиотеке DOM). Повторять его здесь незачем —
// две копии одного описания разойдутся на первой правке.

let captured: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function announce(): void {
  for (const listener of listeners) listener();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Без этого Chrome покажет свою собственную полосу внизу экрана, и
    // предложений станет три.
    event.preventDefault();
    captured = event as BeforeInstallPromptEvent;
    announce();
  });
  // Установили — предлагать больше нечего, обе точки гаснут сами.
  window.addEventListener('appinstalled', () => {
    captured = null;
    announce();
  });
}

/**
 * Можно ли предложить установку и как это сделать.
 *
 * `canInstall` ложно на iOS и в уже установленном приложении: там события
 * нет вовсе. Кнопка, которая гарантированно не работает, хуже её
 * отсутствия — поэтому оба места сами прячутся.
 */
export function useInstallPrompt(): { canInstall: boolean; install: () => Promise<boolean> } {
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    const sync = () => setCanInstall(captured !== null);
    // Событие могло прийти ДО того, как компонент смонтировался: браузер
    // не ждёт React. Поэтому сначала читаем, потом подписываемся.
    sync();
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);

  const install = useCallback(async () => {
    const event = captured;
    if (!event) return false;
    // Гасим ДО показа окна: повторное нажатие, пока окно открыто, уронило
    // бы `prompt()` с ошибкой.
    captured = null;
    announce();
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      return outcome === 'accepted';
    } catch {
      // Браузер отказал показать окно — предлагать больше нечего.
      return false;
    }
  }, []);

  return { canInstall, install };
}
