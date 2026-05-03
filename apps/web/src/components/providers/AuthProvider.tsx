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

interface AuthState {
  user: TelegramUser | null;
  dbUser: { id: string; bonusPoints: number; role: string; createdAt: string; referralCode?: string } | null;
  isLoading: boolean;
  login: (tgUser: TelegramUser) => Promise<boolean>;
  logout: () => void;
  isLoggedIn: boolean;
}

const AuthContext = createContext<AuthState>({
  user: null,
  dbUser: null,
  isLoading: true,
  login: async () => false,
  logout: () => {},
  isLoggedIn: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [dbUser, setDbUser] = useState<AuthState['dbUser']>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('Microgreen-user');
      const savedDb = localStorage.getItem('Microgreen-db-user');
      if (saved) {
        const parsed = JSON.parse(saved) as TelegramUser;
        // Check if auth is less than 30 days old
        const age = Date.now() / 1000 - parsed.auth_date;
        if (age < 30 * 24 * 60 * 60) {
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
  }, []);

  const login = useCallback(async (tgUser: TelegramUser): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tgUser),
      });

      if (!res.ok) return false;
      const data = await res.json();
      if (!data.success) return false;

      setUser(tgUser);
      setDbUser(data.user);
      localStorage.setItem('Microgreen-user', JSON.stringify(tgUser));
      localStorage.setItem('Microgreen-db-user', JSON.stringify(data.user));
      return true;
    } catch {
      // Fallback: save locally without server verification
      setUser(tgUser);
      localStorage.setItem('Microgreen-user', JSON.stringify(tgUser));
      return true;
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setDbUser(null);
    localStorage.removeItem('Microgreen-user');
    localStorage.removeItem('Microgreen-db-user');
  }, []);

  return (
    <AuthContext.Provider value={{ user, dbUser, isLoading, login, logout, isLoggedIn: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
