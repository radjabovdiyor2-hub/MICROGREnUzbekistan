'use client';

import { useSyncExternalStore } from 'react';

// ══════════════════════════════════════════════════════════════════════
// Токены дизайн-системы → готовые цвета для MapLibre.
//
// В paint-выражения нельзя передать `var(--success)`: MapLibre разбирает
// цвет сам и о CSS-переменных не знает. Поэтому значения снимаются с
// documentElement уже вычисленными.
//
// Тема читается как внешнее хранилище, а не через состояние с эффектом:
// её источник — атрибут data-theme на <html>, то есть DOM, и подписка на
// него честнее, чем setState в useEffect (тот вдобавок даёт лишний каскад
// перерисовок). Тот же приём, что в ThemeProvider.
//
// Альтернатива — импорт из @tokens (алиас есть и в tsconfig, и в vitest),
// но там значения ОДНОЙ темы, зашитые на этапе сборки. Карта тогда
// осталась бы светлой внутри тёмной админки.
// ══════════════════════════════════════════════════════════════════════

/** Токены, которые нужны слоям карты. Ключ — имя в коде, значение — токен. */
const TOKENS = {
  success: '--success',
  warning: '--warning',
  error: '--error',
  info: '--info',
  muted: '--text-muted',
  slipping: '--cat-6',
  accent: '--brand-accent',
  brand: '--brand-primary',
  card: '--bg-card',
  border: '--border',
  text: '--text-primary',
  // Последовательная шкала для раскраски по деньгам и частоте.
  rampLow: '--cat-10',
  rampMid: '--cat-11',
  rampHigh: '--cat-12',
} as const;

export type TokenColors = Record<keyof typeof TOKENS, string>;

/** Запасные значения на случай SSR и первого кадра до появления стилей. */
const FALLBACK: TokenColors = {
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
  muted: '#9CA3AF',
  slipping: '#EAB308',
  accent: '#FFB800',
  brand: '#10B981',
  card: '#FFFFFF',
  border: '#E5E7EB',
  text: '#111827',
  rampLow: '#A7F3D0',
  rampMid: '#34D399',
  rampHigh: '#047857',
};

function readTokens(): TokenColors {
  const styles = getComputedStyle(document.documentElement);
  const out = {} as TokenColors;
  for (const [key, token] of Object.entries(TOKENS) as [keyof typeof TOKENS, string][]) {
    const value = styles.getPropertyValue(token).trim();
    out[key] = value || FALLBACK[key];
  }
  return out;
}

// getSnapshot обязан возвращать СТАБИЛЬНУЮ ссылку, пока ничего не менялось:
// новый объект на каждый вызов уводит useSyncExternalStore в бесконечный
// цикл перерисовок. Поэтому палитра кэшируется, а пересчитывается только
// при смене темы.
let cachedTheme: string | null = null;
let cachedColors: TokenColors = FALLBACK;

function getSnapshot(): TokenColors {
  const theme = document.documentElement.getAttribute('data-theme') ?? 'light';
  if (theme !== cachedTheme) {
    cachedTheme = theme;
    cachedColors = readTokens();
  }
  return cachedColors;
}

function getServerSnapshot(): TokenColors {
  return FALLBACK;
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  return () => observer.disconnect();
}

/** Палитра карты, следующая за темой админки. */
export function useTokenColors(): TokenColors {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
