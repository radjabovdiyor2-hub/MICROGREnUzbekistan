'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  toggleTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem('Microgreen-theme') as Theme | null;
  return stored || getSystemTheme();
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Always start with 'light' to match SSR. The inline <script> in layout.tsx
  // handles the initial data-theme attribute before React hydrates.
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  // Apply theme to DOM
  const applyTheme = useCallback((t: Theme) => {
    document.documentElement.setAttribute('data-theme', t);
  }, []);

  useEffect(() => {
    // Read the actual theme from localStorage or system preference
    const stored = localStorage.getItem('Microgreen-theme') as Theme | null;
    const actualTheme = stored || getSystemTheme();
    setTheme(actualTheme);
    applyTheme(actualTheme);
    setMounted(true);

    // Listen for OS-level theme changes (when user hasn't manually chosen)
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemChange = (e: MediaQueryListEvent) => {
      const s = localStorage.getItem('Microgreen-theme');
      // Only auto-switch if user hasn't manually set a preference
      if (!s) {
        const sysTheme = e.matches ? 'dark' : 'light';
        setTheme(sysTheme);
        applyTheme(sysTheme);
      }
    };

    mediaQuery.addEventListener('change', handleSystemChange);
    return () => mediaQuery.removeEventListener('change', handleSystemChange);
  }, [applyTheme]);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('Microgreen-theme', next);
    applyTheme(next);
  };

  // Prevent flash of unstyled content
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
