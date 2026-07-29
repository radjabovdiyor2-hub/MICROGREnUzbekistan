'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: (e?: React.MouseEvent) => void;
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

  const toggleTheme = (e?: React.MouseEvent) => {
    const next = theme === 'light' ? 'dark' : 'light';
    
    // Fallback for browsers that don't support View Transitions API
    if (!document.startViewTransition) {
      setTheme(next);
      localStorage.setItem('Microgreen-theme', next);
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
      setTheme(next);
      localStorage.setItem('Microgreen-theme', next);
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
