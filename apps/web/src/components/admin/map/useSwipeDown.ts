'use client';

import { useCallback, useRef } from 'react';

// ══════════════════════════════════════════════════════════════════════
// Смахнуть вниз — закрыть.
//
// ЗАЧЕМ. В полноэкранном режиме выйти можно было только маленькой кнопкой
// в углу холста. На телефоне угол — самое неудобное место: до правого
// верхнего большой палец не достаёт вовсе, и человек оставался в режиме,
// из которого «не выйти». Смахивание вниз — то, что в этом месте пробуют
// первым, потому что так закрываются нижние листы во всех приложениях.
//
// ПОЧЕМУ СВОЙ ОБРАБОТЧИК, А НЕ БИБЛИОТЕКА. Нужен один жест в одну сторону.
// Зависимость ради тридцати строк — это ещё и её обновления, и её баги.
//
// ЧЕГО ЗДЕСЬ НАМЕРЕННО НЕТ: перетаскивания листа за пальцем. Оно требует
// анимации на каждый кадр касания, а лист держит панели с прокруткой —
// перетаскивание начало бы спорить с ней. Порог по расстоянию и скорости
// даёт то же ощущение и не мешает читать содержимое.
// ══════════════════════════════════════════════════════════════════════

interface Options {
  /** Сколько пикселей вниз считаем намерением закрыть. */
  distance?: number;
  /**
   * Во сколько раз движение вниз должно превысить движение вбок.
   *
   * Без этого «смахнуть» срабатывало бы на диагонали, которой человек
   * листает ленту фильтров вбок, и панель закрывалась бы сама собой.
   */
  ratio?: number;
}

/** Точка касания: где и когда. */
export interface SwipePoint {
  x: number;
  y: number;
  t: number;
}

/**
 * Считать ли движение смахиванием вниз.
 *
 * Вынесено из хука ради проверки: пороги — это то, что ломается молча.
 * Ослабишь — панель закрывается сама, когда человек листает ленту
 * фильтров вбок; ужесточишь — жест перестаёт срабатывать, и владелец
 * снова скажет «свайпов нет». Ни то ни другое не видно в типах.
 */
export function isSwipeDown(
  from: SwipePoint,
  to: SwipePoint,
  { distance = 56, ratio = 1.6 }: Options = {},
): boolean {
  const dy = to.y - from.y;
  const dx = Math.abs(to.x - from.x);
  if (dy < distance) return false;
  // Вниз должно быть заметно больше, чем вбок, — иначе диагональ листания
  // читается как закрытие.
  if (dy < dx * ratio) return false;
  // Медленное ведение пальцем — не жест: человек мог просто вести палец
  // по экрану. Полсекунды с запасом — верхняя граница смахивания.
  return to.t - from.t <= 600;
}

export interface SwipeHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
}

export function useSwipeDown(onSwipe: () => void, options: Options = {}): SwipeHandlers {
  const { distance = 56, ratio = 1.6 } = options;
  const start = useRef<{ x: number; y: number; t: number } | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    start.current = { x: touch.clientX, y: touch.clientY, t: Date.now() };
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const from = start.current;
      start.current = null;
      const touch = e.changedTouches[0];
      if (!from || !touch) return;

      const to = { x: touch.clientX, y: touch.clientY, t: Date.now() };
      if (isSwipeDown(from, to, { distance, ratio })) onSwipe();
    },
    [onSwipe, distance, ratio],
  );

  return { onTouchStart, onTouchEnd };
}
