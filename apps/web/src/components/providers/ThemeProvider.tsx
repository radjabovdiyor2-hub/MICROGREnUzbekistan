'use client';

import { createContext, useContext, useEffect, useCallback, useSyncExternalStore, ReactNode } from 'react';
import { usePersistentState, STRING_CODEC, type Codec } from '@/lib/persistentState';

type Theme = 'light' | 'dark';

const THEME_KEY = 'Microgreen-theme';

// Пустая строка — «пользователь не выбирал», тогда тему диктует система.
type StoredTheme = Theme | '';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function subscribeToSystemTheme(listener: () => void): () => void {
  const mediaQuery = window.matchMedia(DARK_QUERY);
  mediaQuery.addEventListener('change', listener);
  return () => mediaQuery.removeEventListener('change', listener);
}

const getSystemTheme = (): Theme => (window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light');

// На сервере медиа-запроса нет; светлая тема совпадает с разметкой SSR.
const getServerTheme = (): Theme => 'light';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: (e?: React.MouseEvent) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  toggleTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Оба источника читаются как внешние хранилища. Раньше их сводил эффект,
  // который звал setState на маунте: до его выполнения React успевал
  // показать светлую тему, а атрибут data-theme уже стоял тёмный.
  // Атрибут до гидрации выставляет встроенный <script> в layout.tsx.
  const [storedTheme, setStoredTheme] = usePersistentState<StoredTheme>(
    THEME_KEY, '', STRING_CODEC as Codec<StoredTheme>,
  );
  const systemTheme = useSyncExternalStore(subscribeToSystemTheme, getSystemTheme, getServerTheme);

  // Выбор пользователя главнее системного: смена темы в ОС переключает сайт
  // только пока в хранилище пусто.
  const theme: Theme = storedTheme || systemTheme;

  const applyTheme = useCallback((t: Theme) => {
    document.documentElement.setAttribute('data-theme', t);
  }, []);

  useEffect(() => { applyTheme(theme); }, [applyTheme, theme]);

  const toggleTheme = (e?: React.MouseEvent) => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';

    // Fallback for browsers that don't support View Transitions API
    if (!document.startViewTransition) {
      setStoredTheme(next);
      applyTheme(next);
      return;
    }

    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    
    if (e) {
      // Try to get coordinates from click event
      x = e.clientX ?? x;
      y = e.clientY ?? y;
    }
    
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );
    
    const transition = document.startViewTransition(() => {
      setStoredTheme(next);
      applyTheme(next);
    });
    
    transition.ready.then(() => {
      const clipPath = [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${endRadius}px at ${x}px ${y}px)`
      ];
      document.documentElement.animate(
        { clipPath: next === 'dark' ? clipPath : [...clipPath].reverse() },
        {
          duration: 400,
          easing: 'ease-in-out',
          pseudoElement: next === 'dark' ? '::view-transition-new(root)' : '::view-transition-old(root)'
        }
      );
    });
  };

  // Гейт «пока не смонтировано — рендерим без провайдера» здесь больше не
  // нужен: тема известна на первом же клиентском рендере, а сервер и клиент
  // сходятся на светлой. Раньше гейт заодно ронял всё поддерево в момент
  // маунта, потому что менял состав дерева.
  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
