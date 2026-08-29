'use client';

import React, { useEffect, useRef, useState } from 'react';

// ══════════════════════════════════════════════════════════════════════
// Показать содержимое, когда до него доскроллили.
//
// ЗАЧЕМ. `next/dynamic` откладывает разбор кода, но НЕ его загрузку:
// как только компонент попал в дерево, импорт уходит в сеть немедленно.
// Для карты магазина это значило, что при открытии главной браузер
// скачивал MapLibre вместе с тайлами, спрайтами и шрифтами — замер на
// телефоне показал их приход на девятой-двенадцатой секунде, — хотя сама
// карта лежит в самом низу страницы и до неё доходят единицы.
//
// Здесь ждём пересечения с окном. `rootMargin` даёт фору в пол-экрана:
// содержимое успевает подгрузиться до того, как окажется перед глазами,
// и подмена не мигает.
//
// БЕЗ НАБЛЮДАТЕЛЯ ПОКАЗЫВАЕМ СРАЗУ. `IntersectionObserver` есть везде,
// кроме совсем старых браузеров, но если его нет — правильнее показать
// содержимое, чем спрятать навсегда.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  children: React.ReactNode;
  /** Заглушка на месте содержимого, пока до него не доскроллили. */
  placeholder?: React.ReactNode;
  /** Фора до появления в кадре. Пол-экрана телефона. */
  rootMargin?: string;
}

export function WhenVisible({ children, placeholder = null, rootMargin = '400px' }: Props) {
  const anchor = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (shown) return;
    const node = anchor.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [shown, rootMargin]);

  // Якорь остаётся в разметке и после показа: убирать его незачем, а
  // выносить содержимое в другой узел значило бы дёргать раскладку.
  return <div ref={anchor}>{shown ? children : placeholder}</div>;
}
