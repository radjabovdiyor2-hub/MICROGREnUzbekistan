// ════════════════════════════════════════════════════════════
// Детская экосистема FRESH WEEKLY — 3 интерактивные механики.
// ════════════════════════════════════════════════════════════
import type { KidsMechanic } from './types';
import { KIDS_MECHANIC_LABELS } from './types';

export type KidsMode = 'online' | 'ar' | 'print' | 'bot';

export interface KidsMechanicInfo {
  id: KidsMechanic;
  emoji: string;
  label: string;
  desc: string;
  mode: KidsMode;
  href?: string;
  image?: string;
}

export const KIDS_MECHANICS: KidsMechanicInfo[] = [
  { id: 'food_art', emoji: '🎨', label: KIDS_MECHANIC_LABELS.food_art, mode: 'online', href: '/magazine/kids/food-art',
    desc: 'Собери мордочку зверя из еды — интерактивный конструктор с шаблонами!' },
  { id: 'ar_coloring', emoji: '🖌️', label: KIDS_MECHANIC_LABELS.ar_coloring, mode: 'online', href: '/magazine/kids/ar-coloring',
    desc: 'Раскрась героя на экране, сохрани и оживи в AR!' },
];

export function kidsMechanicById(id: KidsMechanic): KidsMechanicInfo | undefined {
  return KIDS_MECHANICS.find((m) => m.id === id);
}
