import React from 'react';
import { AlertTriangle, Bot, Clock, Leaf, Package, ShoppingCart } from 'lucide-react';

export const typeConfig: Record<string, { icon: React.ReactNode; color: string }> = {
  sale: { icon: <ShoppingCart size={14} />, color: 'var(--success)' },
  low_stock: { icon: <AlertTriangle size={14} />, color: 'var(--error)' },
  order: { icon: <Package size={14} />, color: 'var(--info)' },
  growing: { icon: <Leaf size={14} />, color: 'var(--cat-7)' },
  info: { icon: <Clock size={14} />, color: 'var(--cat-1)' },
  office: { icon: <Bot size={14} />, color: 'var(--error)' },
};

export interface Notification {
  id: string;
  type: 'sale' | 'low_stock' | 'order' | 'info' | 'growing' | 'office';
  message: string;
  time: Date;
  read: boolean;
}
