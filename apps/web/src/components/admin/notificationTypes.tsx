import React from 'react';
import { AlertTriangle, Bot, Clock, Package, ShoppingCart } from 'lucide-react';

export const typeConfig: Record<string, { icon: React.ReactNode; color: string }> = {
  sale: { icon: <ShoppingCart size={14} />, color: 'var(--success)' },
  low_stock: { icon: <AlertTriangle size={14} />, color: 'var(--error)' },
  order: { icon: <Package size={14} />, color: 'var(--info)' },
  info: { icon: <Clock size={14} />, color: 'var(--cat-1)' },
  office: { icon: <Bot size={14} />, color: 'var(--error)' },
};

export interface Notification {
  id: string;
  type: 'sale' | 'low_stock' | 'order' | 'info' | 'office';
  message: string;
  time: Date;
  read: boolean;
  /**
   * Готовая команда пульта, если офис её предложил.
   *
   * Правило Джарвиса: сообщать не голый факт, а факт и что с ним делать.
   * Форма совпадает с телом `/api/admin/bot-action`, поэтому кнопка ничего
   * не переводит и не додумывает — просто отправляет то, что пришло.
   */
  action?: { action: string; bot: string };
}
