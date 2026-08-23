'use client';

import { useCallback, useMemo, useState } from 'react';

// ══════════════════════════════════════════════════════════════════════
// Выбор нескольких записей — один механизм на все экраны.
//
// ЧТО БЫЛО
//
// Множественный выбор существовал ровно в одном месте — в задачах, — и
// был там почти недоступен: флажок 16×16 пикселей при норме 44 для пальца.
// Владелец говорит «выбрать несколько невозможно», и это буквально так:
// попасть в такой флажок на телефоне нельзя, а на остальных экранах
// выбирать нечем вовсе. Каждое действие — по одной записи: тридцать
// просроченных задач закрывались тридцатью нажатиями.
//
// ПОЧЕМУ ХУК, А НЕ КОПИЯ НА КАЖДОМ ЭКРАНЕ
//
// Копий было бы шесть, и они разошлись бы: где-то «снять выбор» очищает,
// где-то нет; где-то выбор переживает смену фильтра и потом действие
// уходит на записи, которых человек уже не видит. Последнее особенно
// коварно — поэтому `keepOnly` есть здесь, а не остаётся на совести
// каждого экрана.
//
// РАБОТАЕТ С ЛЮБЫМ КЛЮЧОМ: у задач и заявок это число, у заказов и
// товаров — строка cuid.
// ══════════════════════════════════════════════════════════════════════

export interface Selection<T extends string | number> {
  /** Выбранные ключи в порядке добавления. */
  ids: T[];
  count: number;
  has: (id: T) => boolean;
  toggle: (id: T) => void;
  clear: () => void;
  /**
   * Выбрать всё видимое или снять всё, если уже всё выбрано.
   *
   * Именно ВИДИМОЕ, а не всё существующее: человек нажимает «выбрать всё»,
   * глядя на отфильтрованный список, и ожидает получить то, что перед ним.
   */
  toggleAll: (visible: T[]) => void;
  /** Всё ли видимое выбрано — по этому признаку рисуется галка в шапке. */
  allSelected: (visible: T[]) => boolean;
  /**
   * Оставить в выборе только то, что ещё видно.
   *
   * Зовётся при смене фильтра или после обновления списка. Без этого
   * действие уходило бы на записи, которых человек уже не видит: выбрал
   * тридцать задач, переключил фильтр на «сегодня» — и удалил вчерашние.
   */
  keepOnly: (visible: T[]) => void;
}

// ── Решения вынесены в чистые функции ──────────────────────────────
//
// Не ради красоты: именно здесь живут тонкости, которые ломаются молча —
// «выбрать всё» дополняет или заменяет, `keepOnly` сохраняет ссылку или
// нет. Внутри хука их можно проверить только через рендер компонента, то
// есть притащив в проект библиотеку тестирования React. Снаружи — обычным
// сравнением, без единой новой зависимости.

/** Выбрать всё видимое или снять, если оно уже всё выбрано. */
export function withAllToggled<T extends string | number>(prev: T[], visible: T[]): T[] {
  const everything = visible.length > 0 && visible.every((id) => prev.includes(id));
  // Снимаем ТОЛЬКО видимое: выбранное на другой странице не трогаем.
  if (everything) return prev.filter((id) => !visible.includes(id));

  // Дополняем, а не заменяем: иначе выбор с прошлой страницы пропадал бы
  // от нажатия «выбрать всё» на этой.
  const merged = [...prev];
  for (const id of visible) if (!merged.includes(id)) merged.push(id);
  return merged;
}

/**
 * Оставить только то, что ещё видно.
 *
 * Ссылка сохраняется, когда ничего не пропало: список пересоздаётся каждым
 * обновлением, и новый массив на каждый тик означал бы перерисовку всего
 * экрана без причины.
 */
export function withOnlyVisible<T extends string | number>(prev: T[], visible: T[]): T[] {
  const next = prev.filter((id) => visible.includes(id));
  return next.length === prev.length ? prev : next;
}

/** Всё ли видимое выбрано. Пустой список выбранным не считается. */
export function isAllSelected<T extends string | number>(ids: T[], visible: T[]): boolean {
  return visible.length > 0 && visible.every((id) => ids.includes(id));
}

export function useSelection<T extends string | number>(): Selection<T> {
  const [ids, setIds] = useState<T[]>([]);

  const has = useCallback((id: T) => ids.includes(id), [ids]);

  const toggle = useCallback((id: T) => {
    setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const clear = useCallback(() => setIds([]), []);

  const allSelected = useCallback((visible: T[]) => isAllSelected(ids, visible), [ids]);

  const toggleAll = useCallback((visible: T[]) => {
    setIds((prev) => withAllToggled(prev, visible));
  }, []);

  const keepOnly = useCallback((visible: T[]) => {
    setIds((prev) => withOnlyVisible(prev, visible));
  }, []);

  return useMemo(
    () => ({ ids, count: ids.length, has, toggle, clear, toggleAll, allSelected, keepOnly }),
    [ids, has, toggle, clear, toggleAll, allSelected, keepOnly],
  );
}
