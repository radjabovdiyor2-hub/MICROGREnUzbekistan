'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export interface SimpleUser {
  id: string;
  first_name: string;
  last_name?: string;
  username?: string;
  phone: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
  isSimple: true;
}

type AppUser = TelegramUser | SimpleUser;

interface AuthState {
  user: AppUser | null;
  dbUser: { id: string; bonusPoints: number; role: string; createdAt: string; referralCode?: string; phone?: string } | null;
  isLoading: boolean;
  login: (tgUser: TelegramUser) => Promise<boolean>;
  webAppLogin: (initData: string) => Promise<boolean>;
  logout: () => Promise<void>;
  isLoggedIn: boolean;
}

const AuthContext = createContext<AuthState>({
  user: null,
  dbUser: null,
  isLoading: true,
  login: async () => false,
  webAppLogin: async () => false,
  logout: async () => {},
  isLoggedIn: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [dbUser, setDbUser] = useState<AuthState['dbUser']>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session from localStorage
  useEffect(() => {
    let mounted = true;
    Promise.resolve().then(() => {
      if (!mounted) return;
      try {
        const saved = localStorage.getItem('Microgreen-user');
        const savedDb = localStorage.getItem('Microgreen-db-user');
        if (saved) {
          const parsed = JSON.parse(saved) as AppUser;
          const age = Date.now() / 1000 - parsed.auth_date;
          if (age < 90 * 24 * 60 * 60) {
            setUser(parsed);
            if (savedDb) setDbUser(JSON.parse(savedDb));
          } else {
            localStorage.removeItem('Microgreen-user');
            localStorage.removeItem('Microgreen-db-user');
          }
        }
      } catch {
        // ignore
      }
      setIsLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  // Telegram login
  const login = useCallback(async (tgUser: TelegramUser): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tgUser),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setUser(tgUser);
          setDbUser(data.user);
          localStorage.setItem('Microgreen-user', JSON.stringify(tgUser));
          localStorage.setItem('Microgreen-db-user', JSON.stringify(data.user));
          return true;
        }
      }
    } catch {
      // fallback
    }
    // Fallback: save locally without server verification
    setUser(tgUser);
    localStorage.setItem('Microgreen-user', JSON.stringify(tgUser));
    return true;
  }, []);

  // Telegram Mini App login — validate WebApp.initData server-side.
  const webAppLogin = useCallback(async (initData: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/telegram-webapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.tgUser) {
          const appUser: TelegramUser = {
            id: data.tgUser.id,
            first_name: data.tgUser.first_name || 'Telegram',
            last_name: data.tgUser.last_name,
            username: data.tgUser.username,
            photo_url: data.tgUser.photo_url,
            auth_date: Math.floor(Date.now() / 1000),
            hash: 'tma',
          };
          setUser(appUser);
          setDbUser(data.user || null);
          localStorage.setItem('Microgreen-user', JSON.stringify(appUser));
          if (data.user) localStorage.setItem('Microgreen-db-user', JSON.stringify(data.user));
          return true;
        }
      }
    } catch {
      // ignore — stays logged out
    }
    return false;
  }, []);

  const logout = useCallback(async () => {
    // Куки гасит СЕРВЕР: она httpOnly, из JS её не достать. Раньше выход
    // чистил только localStorage — экран показывал «вы вышли», а сессия
    // на тридцать суток продолжала жить, и следующий заказ уходил на тот
    // же аккаунт.
    try {
      await fetch('/api/auth/session', { method: 'DELETE' });
    } catch {
      // Сеть отвалилась — локальное состояние всё равно чистим, иначе
      // человек останется на экране, который врёт, что он внутри.
    }
    setUser(null);
    setDbUser(null);
    localStorage.removeItem('Microgreen-user');
    localStorage.removeItem('Microgreen-db-user');
  }, []);

  return (
    <AuthContext.Provider value={{ user, dbUser, isLoading, login, webAppLogin, logout, isLoggedIn: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
