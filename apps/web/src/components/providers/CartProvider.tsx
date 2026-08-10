'use client';

import { createContext, useContext, useCallback, ReactNode } from 'react';
import { usePersistentState } from '@/lib/persistentState';
import { triggerHaptic } from '@/utils/haptic';
import { DELIVERY } from '@/lib/site';
import { trackAddToCart } from '@/lib/analytics';

// ==========================================
// Cart Store — localStorage-backed
// ==========================================

export interface CartProduct {
  id: string;
  nameUz: string;
  nameRu?: string;
  price: number;
  oldPrice?: number | null;
  /**
   * За что назначена цена: «лоток», «100 г», «кг».
   *
   * Необязательно: корзина лежит в localStorage, и у корзин, собранных до
   * появления единицы, поля просто нет — терять их из-за этого нельзя.
   */
  unit?: string | null;
  slug: string;
  images: string[];
  category?: { nameUz: string; slug: string };
}

export interface CartItem {
  product: CartProduct;
  quantity: number;
}

interface CartContextType {
  items: CartItem[];
  addItem: (product: CartProduct, quantity?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  subtotal: number;
  deliveryFee: number;
  total: number;
}

const CartContext = createContext<CartContextType | null>(null);

const CART_KEY = 'Microgreen_cart';
// Стабильная ссылка: см. требование usePersistentState к fallback.
const EMPTY_ITEMS: CartItem[] = [];
const FREE_DELIVERY_THRESHOLD = DELIVERY.freeThreshold;
const DELIVERY_FEE = DELIVERY.fee;

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = usePersistentState<CartItem[]>(CART_KEY, EMPTY_ITEMS);

  const addItem = useCallback((product: CartProduct, quantity = 1) => {
    triggerHaptic('success');
    trackAddToCart({ id: product.id, name: product.nameRu || product.nameUz, price: product.price, quantity });
    setItems(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) {
        return prev.map(i =>
          i.product.id === product.id
            ? { ...i, quantity: i.quantity + quantity }
            : i
        );
      }
      return [...prev, { product, quantity }];
    });
  }, [setItems]);

  const removeItem = useCallback((productId: string) => {
    triggerHaptic('medium');
    setItems(prev => prev.filter(i => i.product.id !== productId));
  }, [setItems]);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    triggerHaptic('light');
    if (quantity <= 0) {
      setItems(prev => prev.filter(i => i.product.id !== productId));
      return;
    }
    setItems(prev => prev.map(i =>
      i.product.id === productId ? { ...i, quantity } : i
    ));
  }, [setItems]);

  const clearCart = useCallback(() => {
    triggerHaptic('heavy');
    setItems(EMPTY_ITEMS);
  }, [setItems]);

  const totalItems = items.reduce((s, i) => s + i.quantity, 0);
  const subtotal = items.reduce((s, i) => s + i.product.price * i.quantity, 0);
  const deliveryFee = subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;
  const total = subtotal + deliveryFee;

  return (
    <CartContext.Provider value={{
      items, addItem, removeItem, updateQuantity, clearCart,
      totalItems, subtotal, deliveryFee, total,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be inside CartProvider');
  return ctx;
}
