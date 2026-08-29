'use client';

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { ALL_TABS } from './adminTabs';

// ══════════════════════════════════════════════════════════════════════
// Вкладка админки в адресной строке.
//
// Раньше активная вкладка жила только в useState, и `/admin` всегда
// открывался на кассе. Из-за этого оповещения ИИ-офиса в Telegram были
// тупиком: бот писал «Удалить задачу #95 — ждёт 115 ч», а владельцу
// оставалось открыть сайт и искать нужный экран глазами среди сорока
// семи вкладок. Теперь ссылка приводит прямо на него:
//
//     /admin?tab=tasks&focus=95
//
// Параметры переживают экран пароля сами: вход идёт fetch'ем без
// навигации (useAdminAuth), адресная строка не меняется — поэтому здесь
// важно читать их реактивно, а не один раз при монтировании.
//
// ПОЧЕМУ НЕ router.replace
//
// Он здесь стоял, и каждое нажатие вкладки стоило похода на сервер.
// Страница объявлена `export const dynamic = 'force-dynamic'` (page.tsx):
// на любую навигацию Next заново читает cookie, проверяет подпись сессии,
// рендерит дерево и стримит RSC-ответ — и только потом меняется экран.
// Это и была «медленная кнопка»: сорок вкладок, каждая через сеть, хотя
// сама вкладка — чистое клиентское состояние, и сервер о ней ничего нового
// сказать не может.
//
// `window.history.replaceState` меняет адрес БЕЗ обращения к серверу, и
// Next 16 это поддерживает штатно: «pushState and replaceState calls
// integrate into the Next.js Router, allowing you to sync with usePathname
// and useSearchParams» (docs/01-app/01-getting-started/04-linking-and-navigating,
// раздел Native History API). Поэтому `useSearchParams` ниже по-прежнему
// видит смену вкладки, а ссылки из Telegram работают как работали.
// ══════════════════════════════════════════════════════════════════════

/** Куда открывать админку, если вкладка не задана. */
const DEFAULT_TAB = 'pos';

export function useAdminTab() {
  const params = useSearchParams();

  const requested = params.get('tab');

  // Неизвестное значение игнорируем молча: ссылка могла прийти из старой
  // версии бота, и падать из-за неё экран не должен.
  const activeTab = useMemo(() => {
    if (requested && ALL_TABS.some((tab) => tab.id === requested)) return requested;
    return DEFAULT_TAB;
  }, [requested]);

  const openTab = useCallback((id: string) => {
    const next = new URLSearchParams(window.location.search);
    next.set('tab', id);
    // Смена вкладки — не отдельный шаг истории: иначе «назад» в браузере
    // и в Telegram Mini App отматывал бы по одной вкладке за нажатие.
    // `focus` снимаем: он относился к прошлому экрану.
    next.delete('focus');
    next.delete('q');
    window.history.replaceState(null, '', `/admin?${next.toString()}`);
  }, []);

  // `q` — «открой раздел с этим в поиске». Так работает переход
  // «заказ → его клиент»: у заказа есть телефон, а id клиента CRM нет.
  // Снимается вместе с `focus` при смене вкладки: он тоже про прошлый экран.
  return {
    activeTab,
    focus: params.get('focus') ?? '',
    query: params.get('q') ?? '',
    openTab,
  };
}
