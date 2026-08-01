'use client';

import { CheckCircle, Droplet, Leaf, Sun } from 'lucide-react';

// Статика ленты Instagram: стадии выращивания, запасные посты и иконка
// стадии. Вынесено из InstagramFeed — от состояния не зависит.

// Growing stages timeline — real microgreen growth cycle
export const GROW_STAGES = [
  {
    day: 1,
    titleUz: 'Urug\'larni ekish',
    titleRu: 'Посадка семян',
    descUz: 'Sifatli substratga urug\'lar ekiladi va nam muhit yaratiladi',
    descRu: 'Семена высаживаются в качественный субстрат и создаётся влажная среда',
    color: 'var(--cat-2)',
    icon: 'seed',
  },
  {
    day: 3,
    titleUz: 'Unib chiqish',
    titleRu: 'Прорастание',
    descUz: 'Urug\'lar unib chiqadi, dastlabki ildizlar ko\'rinadi',
    descRu: 'Семена прорастают, появляются первые корешки',
    color: 'var(--brand-primary)',
    icon: 'sprout',
  },
  {
    day: 5,
    titleUz: 'O\'sish bosqichi',
    titleRu: 'Стадия роста',
    descUz: 'Barglar ochiladi, fotosintez boshlanadi. Yorug\'lik va suv muhim',
    descRu: 'Листочки раскрываются, начинается фотосинтез. Свет и вода важны',
    color: 'var(--info)',
    icon: 'grow',
  },
  {
    day: 7,
    titleUz: 'Yig\'im — Tayyor!',
    titleRu: 'Срез — Готово!',
    descUz: 'Mikroko\'katlar to\'liq yetildi. Yangi va sog\'lom holda yetkaziladi',
    descRu: 'Микрозелень полностью созрела. Доставляется свежей и полезной',
    color: 'var(--warning)',
    icon: 'harvest',
  },
];

export const INSTAGRAM_HANDLE = 'microgreenuzbekistan';
export const INSTAGRAM_URL = `https://www.instagram.com/${INSTAGRAM_HANDLE}`;

// Fallback mock posts when API is not configured
export const FALLBACK_POSTS = [
  { id: '1', caption: 'Bugungi hosilimiz — yangi kesilgan rukkola 🌱', mediaUrl: '', permalink: INSTAGRAM_URL, mediaType: 'IMAGE' },
  { id: '2', caption: 'Qizil karam 3-kunlik o\'sish jarayoni 🌿', mediaUrl: '', permalink: INSTAGRAM_URL, mediaType: 'IMAGE' },
  { id: '3', caption: 'Mijozlarimiz uchun yangi partiya 📦', mediaUrl: '', permalink: INSTAGRAM_URL, mediaType: 'IMAGE' },
  { id: '4', caption: 'Brokkoli mikroko\'kati — vitaminlar xazinasi 💚', mediaUrl: '', permalink: INSTAGRAM_URL, mediaType: 'IMAGE' },
  { id: '5', caption: 'Kungaboqar mikroko\'kati quyoshda ☀️', mediaUrl: '', permalink: INSTAGRAM_URL, mediaType: 'IMAGE' },
  { id: '6', caption: 'Restoranga HoReCa yetkazib berish 🚚', mediaUrl: '', permalink: INSTAGRAM_URL, mediaType: 'IMAGE' },
];

export interface InstaPost {
  id: string;
  caption: string;
  mediaUrl: string;
  mediaType: string;
  permalink: string;
  timestamp?: string;
}

export interface ShopProduct {
  id: string;
  nameUz: string;
  nameRu?: string;
  price: number;
  slug?: string;
  images?: string[];
}

export function StageIcon({ type, size = 24 }: { type: string; size?: number }) {
  if (type === 'seed') return <Droplet size={size} />;
  if (type === 'sprout') return <Leaf size={size} />;
  if (type === 'grow') return <Sun size={size} />;
  if (type === 'harvest') return <CheckCircle size={size} />;
  return <Leaf size={size} />;
}

// Color palette for fallback posts without images
export const FALLBACK_COLORS = ['var(--brand-primary)', 'var(--info)', 'var(--cat-2)', 'var(--warning)', 'var(--cat-3)', 'var(--accent-cyan)'];
