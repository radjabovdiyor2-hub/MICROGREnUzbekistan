'use client';

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ALL_TABS } from './adminTabs';
import type { StaffRole } from './useAdminAuth';

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
// ══════════════════════════════════════════════════════════════════════

/** Куда открывать админку, если вкладка не задана. */
function defaultTab(role: StaffRole | null): string {
  return role === 'GROWER' ? 'growing' : 'pos';
}

export function useAdminTab(initialRole: StaffRole | null) {
  const router = useRouter();
  const params = useSearchParams();

  const requested = params.get('tab');

  // Неизвестное значение игнорируем молча: ссылка могла прийти из старой
  // версии бота, и падать из-за неё экран не должен.
  const activeTab = useMemo(() => {
    if (requested && ALL_TABS.some((tab) => tab.id === requested)) return requested;
    return defaultTab(initialRole);
  }, [requested, initialRole]);

  const openTab = useCallback(
    (id: string) => {
      const next = new URLSearchParams(params.toString());
      next.set('tab', id);
      // Смена вкладки — не отдельный шаг истории: иначе «назад» в браузере
      // и в Telegram Mini App отматывал бы по одной вкладке за нажатие.
      // `focus` снимаем: он относился к прошлому экрану.
      next.delete('focus');
      router.replace(`/admin?${next.toString()}`, { scroll: false });
    },
    [params, router],
  );

  return { activeTab, focus: params.get('focus') ?? '', openTab };
}
