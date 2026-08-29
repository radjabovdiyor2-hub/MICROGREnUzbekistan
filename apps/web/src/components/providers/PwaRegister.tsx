'use client';

import { useEffect } from 'react';

// ══════════════════════════════════════════════════════════════════════
// Регистрация служебного воркера.
//
// ПЕРВЫЙ ВИЗИТ НЕ ДОЛЖЕН ЗАКАНЧИВАТЬСЯ ПЕРЕЗАГРУЗКОЙ. Воркер ставит себя
// `skipWaiting` + `clients.claim()` и сразу шлёт открытым вкладкам
// «обновись». На повторном заходе это верно: страницу мог отдать старый
// кэш. На ПЕРВОМ — нет: вкладка только что скачала всё из сети, свежее
// уже некуда, а перезагрузка заставляла браузер пройти круг заново.
//
// Замер главной на живом сайте показывал ровно это: каждый запрос уходил
// дважды с разрывом в 2,3 с — 6,3 МБ и 36 секунд до тишины вместо
// половины. Ни одной ошибки при этом не возникало.
//
// Отличить первый визит от обновления можно одним признаком: был ли у
// вкладки управляющий воркер ДО регистрации. Считать его надо сразу —
// после `claim()` он появляется и у первого визита тоже.
// ══════════════════════════════════════════════════════════════════════

export function PwaRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;

    // Снимок ДО регистрации: пусто — это первая установка, а не обновление.
    const hadController = Boolean(navigator.serviceWorker.controller);

    // Перезагрузка одна на страницу. Сигналов о новой версии два —
    // состояние воркера и его сообщение, — и оба приходят на одно
    // событие: без этого замка страница перезагружалась дважды подряд.
    let reloading = false;
    const reloadOnce = (why: string) => {
      if (reloading || !hadController) return;
      reloading = true;
      console.log(`🔄 Новая версия (${why}) — обновляю страницу`);
      window.location.reload();
    };

    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        const timer = setInterval(() => {
          reg.update().catch(() => {});
        }, 60_000);

        reg.addEventListener('updatefound', () => {
          const fresh = reg.installing;
          if (!fresh) return;
          fresh.addEventListener('statechange', () => {
            if (fresh.state === 'activated') reloadOnce('воркер активирован');
          });
        });

        // Интервал живёт, пока живёт вкладка: очистка тут — на случай
        // размонтирования в разработке, а не ради экономии.
        return () => clearInterval(timer);
      })
      .catch((err) => {
        console.error('❌ Воркер не зарегистрирован:', err);
      });

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SW_UPDATED') reloadOnce('сообщение воркера');
    };
    navigator.serviceWorker.addEventListener('message', onMessage);

    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  return null;
}
