'use client';

import { useCallback, useEffect, useState } from 'react';

import { useAdminBack } from '../useAdminBack';

// ══════════════════════════════════════════════════════════════════════
// Карта на весь экран.
//
// ПОЧЕМУ НЕ Fullscreen API И НЕ FullscreenControl ИЗ MAPLIBRE
//
// iOS Safari не умеет `requestFullscreen` ни на чём, кроме <video>, а
// админку в поле открывают внутри Telegram — то есть именно там, где
// нативный путь и не работает. Отдельно: `FullscreenControl` накрывает
// только контейнер холста, и всё, что мы рисуем поверх карты (поиск,
// легенда, панель точки), осталось бы за кадром.
//
// Поэтому режим чисто вёрсточный: `position: fixed` на сцену. Работает
// одинаково везде, и выход из него — наше решение, а не браузера.
//
// ПОЧЕМУ КЛАСС НА <html>, А НЕ body.style.overflow
//
// Идиома из Drawer.tsx (`document.body.style.overflow = 'hidden'`) в
// админке — пустышка: `body` тут не скроллит вовсе, скроллит `.admin-main`
// внутри `.admin-layout { height: 100vh; overflow: hidden }`. Класс на
// корне даёт CSS дотянуться до нужного элемента, не разыскивая его в DOM.
// ══════════════════════════════════════════════════════════════════════

const HTML_CLASS = 'map-fullscreen';

export interface MapFullscreen {
  isFull: boolean;
  toggle: () => void;
  exit: () => void;
}

/**
 * @param escapeExits можно ли выходить по Escape прямо сейчас. `false`,
 *        когда поверх карты открыто что-то своё — панель точки или режим
 *        простановки пина. Иначе одно нажатие закрывало бы сразу два
 *        экрана, и человек терял бы не то, что собирался.
 */
export function useMapFullscreen(escapeExits: boolean = true): MapFullscreen {
  const [isFull, setFull] = useState(false);

  const exit = useCallback(() => setFull(false), []);
  const toggle = useCallback(() => setFull((prev) => !prev), []);

  // Прокрутка фона: без этого страница под картой продолжает ехать под
  // пальцем, и выход из режима возвращает человека не туда, откуда он вошёл.
  useEffect(() => {
    if (!isFull) return;
    const root = document.documentElement;
    root.classList.add(HTML_CLASS);
    return () => root.classList.remove(HTML_CLASS);
  }, [isFull]);

  useEffect(() => {
    if (!isFull || !escapeExits) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFull(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFull, escapeExits]);

  // Аппаратное «назад» в Telegram. Стопка возвратов работает по принципу
  // «последний вошёл — первый вышел», а панель точки встаёт в неё ПОЗЖЕ
  // режима, поэтому лестница выхода получается сама: сначала панель,
  // потом полный экран, потом уже выход из приложения.
  useAdminBack(exit, isFull);

  return { isFull, toggle, exit };
}
