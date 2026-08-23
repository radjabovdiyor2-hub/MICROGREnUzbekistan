'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { ALL_TABS, TAB_GROUPS } from './adminTabs';

// ══════════════════════════════════════════════════════════════════════
// Как найти нужный экран среди пятидесяти.
//
// ЧТО БЫЛО
//
// Все 50 вкладок раскрыты одним списком в двенадцати группах. Владелец
// каждый день ходит в пять-шесть из них — касса, сводка, заказы, посадки,
// задачи, — а листает мимо сорока четырёх. На телефоне это выдвижная
// панель, то есть тот же список в окне высотой с ладонь.
//
// ЧТО ЗДЕСЬ
//
// Два ответа на один вопрос, и они дополняют друг друга:
//
//   1. «Часто» — вкладки, которыми пользовались последними. Не рейтинг за
//      всё время: сезон меняется, и в июне это посадки, а в декабре —
//      журнал. Список короткий: длинный перестаёт быть коротким путём.
//   2. Свёрнутые группы. Раскрыта та, в которой открытая вкладка, и те,
//      которые человек раскрыл сам. Выбор запоминается — иначе каждое
//      открытие админки начиналось бы с наведения порядка.
//
// Всё в localStorage вкладки: это предпочтение одного человека за одним
// экраном, а не данные, которым место на сервере.
// ══════════════════════════════════════════════════════════════════════

const RECENT_KEY = 'mg-admin-recent-tabs';

//: Свёрнутые группы, а НЕ раскрытые.
//
// Сначала было наоборот: хранились раскрытые, всё остальное свёрнуто по
// умолчанию. Это чинило стену из пятидесяти вкладок и ломало обычную
// работу — каждый переход становился двумя нажатиями, и надо было помнить,
// в какой группе что лежит. Собственный сквозной сценарий это и поймал:
// кнопка «Клиенты» просто отсутствовала в разметке.
//
// Теперь свернуть — осознанное действие человека, который убирает лишнее,
// а не обряд при каждом открытии админки. Стену разбирает раздел «Часто».
const COLLAPSED_KEY = 'mg-admin-collapsed-groups';

/**
 * Сколько вкладок держим в «Часто».
 *
 * Пять — это ровно тот дневной круг, ради которого раздел и заводится.
 * Десять уже требуют чтения списка, то есть возвращают исходную задачу.
 */
export const RECENT_LIMIT = 5;

function read(key: string): string[] {
  try {
    if (typeof globalThis.localStorage === 'undefined') return [];
    const parsed: unknown = JSON.parse(globalThis.localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    // Приватный режим и повреждённое значение ведут себя одинаково:
    // навигация обязана работать и без памяти.
    return [];
  }
}

function write(key: string, value: string[]): void {
  try {
    if (typeof globalThis.localStorage === 'undefined') return;
    globalThis.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Квота или приватный режим — предпочтение просто не переживёт сессию.
  }
}

/** Группа, в которой лежит вкладка. Пустая строка — вкладка неизвестна. */
export function groupOf(tabId: string): string {
  return ALL_TABS.find((t) => t.id === tabId)?.group.ru ?? '';
}

export function useTabNavigation(activeTab: string, isOwner: boolean) {
  const [recent, setRecent] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  /** Прочитали ли хранилище. До этого момента писать в него нельзя. */
  const [ready, setReady] = useState(false);

  // Чтение — в эффекте: на сервере localStorage нет, и первый рендер
  // обязан совпасть с серверным, иначе React ругается на расхождение.
  //
  // Через такт, а не сразу: синхронный setState в эффекте даёт каскад
  // перерисовок ещё до первой отрисовки меню. Тот же приём, что в очереди
  // визитов (`map/useVisitQueue`), и по той же причине.
  useEffect(() => {
    const kick = window.setTimeout(() => {
      setRecent(read(RECENT_KEY));
      setCollapsed(read(COLLAPSED_KEY));
      setReady(true);
    }, 0);
    return () => window.clearTimeout(kick);
  }, []);

  // Открытая вкладка попадает в «Часто» — но только у владельца: у
  // продавца вкладок три, и короткий путь к ним не нужен.
  useEffect(() => {
    if (!ready || !isOwner || !activeTab) return;
    const kick = window.setTimeout(() => {
      setRecent((prev) => {
        const next = [activeTab, ...prev.filter((id) => id !== activeTab)].slice(0, RECENT_LIMIT);
        if (next.join() === prev.join()) return prev;
        write(RECENT_KEY, next);
        return next;
      });
    }, 0);
    return () => window.clearTimeout(kick);
  }, [activeTab, isOwner, ready]);

  const toggleGroup = useCallback((title: string) => {
    setCollapsed((prev) => {
      const next = prev.includes(title) ? prev.filter((g) => g !== title) : [...prev, title];
      write(COLLAPSED_KEY, next);
      return next;
    });
  }, []);

  /**
   * Раскрыта ли группа.
   *
   * По умолчанию — да: свернуть можно, но это выбор человека, а не
   * умолчание. Группа с открытой вкладкой раскрыта ВСЕГДА, даже если её
   * свернули раньше: иначе активный экран прятался бы сам от себя, и было
   * бы непонятно, где ты находишься.
   */
  const isGroupOpen = useCallback(
    (title: string) => !collapsed.includes(title) || groupOf(activeTab) === title,
    [collapsed, activeTab],
  );

  /** Вкладки «Часто» — в порядке последнего использования. */
  const recentTabs = useMemo(
    () =>
      recent
        .map((id) => ALL_TABS.find((t) => t.id === id))
        .filter((t): t is (typeof ALL_TABS)[number] => Boolean(t)),
    [recent],
  );

  /** Сколько вкладок в группе — подпись рядом со свёрнутым заголовком. */
  const groupSize = useCallback(
    (title: string) => TAB_GROUPS.find((g) => g.title.ru === title)?.tabs.length ?? 0,
    [],
  );

  return { recentTabs, isGroupOpen, toggleGroup, groupSize };
}
