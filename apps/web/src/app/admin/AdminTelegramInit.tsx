'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { goBack, onBackDepth } from '@/lib/adminBack';
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
  /** Отписки от кнопки «назад»: эффект уходит вместе с оболочкой админки. */
  const unsubscribe = useRef<(() => void) | null>(null);
  const offClick = useRef<(() => void) | null>(null);

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

    // «Назад» возвращает к списку, а не закрывает приложение.
    //
    // Переходы «список → карточка» живут в состоянии экрана и в историю
    // браузера не попадают, поэтому аппаратная кнопка выходила из Mini App
    // прямо из открытого заказа. Показываем кнопку Telegram, пока открыт
    // вложенный экран, и прячем на верхнем уровне — там «выйти» и верно.
    const back = wa.BackButton;
    if (back) {
      const onClick = () => goBack();
      back.onClick(onClick);
      unsubscribe.current = onBackDepth((depth) => {
        if (depth > 0) back.show();
        else back.hide();
      });
      offClick.current = () => back.offClick(onClick);
    }

    if (isAuthenticated) return;

    void (async () => {
      // Две двери по очереди: сначала владелец, потом сотрудник.
      //
      // Отличить их заранее нельзя — обе решаются по подписи на сервере, и
      // спрашивать у человека «вы владелец?» перед входом бессмысленно.
      // Порядок такой: владельцев единицы, и у них первая же попытка
      // заканчивается успехом, а 403 у сотрудника — это не ошибка, а
      // «дверь не та», и стоит она один запрос.
      const doors = ['/api/auth/telegram-admin', '/api/auth/telegram-staff'];

      for (const door of doors) {
        try {
          const res = await fetch(door, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ initData: wa.initData }),
          });
          // Роль приходит из cookie, которую читает серверный admin/page.tsx —
          // поэтому обновляем страницу, а не поднимаем состояние на клиенте.
          if (res.ok) {
            router.refresh();
            return;
          }
          // 429 — перебор попыток: вторая дверь упрётся в тот же лимит.
          if (res.status === 429) return;
        } catch {
          /* сети нет — остаётся обычный вход по паролю */
          return;
        }
      }
    })();
  }, [isAuthenticated, router]);

  // Отписка отдельным эффектом: основной срабатывает один раз за открытие
  // (сторож `tried`), и вешать на него очистку значило бы снимать кнопку
  // «назад» при первой же смене `isAuthenticated`.
  useEffect(() => () => {
    unsubscribe.current?.();
    offClick.current?.();
  }, []);

  return null;
}
