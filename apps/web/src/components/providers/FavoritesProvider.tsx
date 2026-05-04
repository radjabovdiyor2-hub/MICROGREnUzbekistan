'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

// ==========================================
// Favorites Store — localStorage-backed
// ==========================================

export interface FavoriteProduct {
  id: string;
  nameUz: string;
  nameRu?: string;
  price: number;
  oldPrice?: number | null;
  slug: string;
  images: string[];
  rating?: number;
  category?: { nameUz: string; slug: string };
}

interface FavoritesContextType {
  favorites: FavoriteProduct[];
  addFavorite: (product: FavoriteProduct) => void;
  removeFavorite: (productId: string) => void;
  toggleFavorite: (product: FavoriteProduct) => void;
  isFavorite: (productId: string) => boolean;
  count: number;
}

const FavoritesContext = createContext<FavoritesContextType | null>(null);
const FAV_KEY = 'Microgreen_favorites';

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<FavoriteProduct[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(FAV_KEY);
      if (saved) setFavorites(JSON.parse(saved));
    } catch (e) {
      console.error('Favorites load error:', e);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem(FAV_KEY, JSON.stringify(favorites));
  }, [favorites, loaded]);

  const addFavorite = useCallback((product: FavoriteProduct) => {
    setFavorites(prev => {
      if (prev.find(f => f.id === product.id)) return prev;
      return [...prev, product];
    });
  }, []);

  const removeFavorite = useCallback((productId: string) => {
    setFavorites(prev => prev.filter(f => f.id !== productId));
  }, []);

  const toggleFavorite = useCallback((product: FavoriteProduct) => {
    setFavorites(prev => {
      if (prev.find(f => f.id === product.id)) {
        return prev.filter(f => f.id !== product.id);
      }
      return [...prev, product];
    });
  }, []);

  const isFavorite = useCallback((productId: string) => {
    return favorites.some(f => f.id === productId);
  }, [favorites]);

  return (
    <FavoritesContext.Provider value={{
      favorites, addFavorite, removeFavorite, toggleFavorite, isFavorite,
      count: favorites.length,
    }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be inside FavoritesProvider');
  return ctx;
}
