// Рубрики, размер страницы и варианты сортировки каталога.
// Файл .tsx: у рубрик есть иконки, то есть JSX.

import { Droplet, Leaf, Package, Plug, Sparkles } from 'lucide-react';

export const PAGE_SIZE = 24;

export const CATEGORIES = [
  { slug: '', nameUz: 'Barchasi', nameRu: 'Все', icon: <Package size={18} /> },
  { slug: 'microgreens', nameUz: "Mikroko'katlar", nameRu: 'Микрозелень', icon: <Leaf size={18} /> },
  { slug: 'baby-leaf', nameUz: 'Baby Leaf', nameRu: 'Бейби лист', icon: <Leaf size={18} /> },
  { slug: 'salads', nameUz: 'Salatlar', nameRu: 'Салаты', icon: <Leaf size={18} /> },
  { slug: 'flowers', nameUz: 'Gullar', nameRu: 'Цветы', icon: <Sparkles size={18} /> },
  { slug: 'seeds', nameUz: "Urug'lar", nameRu: 'Семена', icon: <Droplet size={18} /> },
  { slug: 'equipment', nameUz: 'Uskunalar', nameRu: 'Оборудование', icon: <Plug size={18} /> },
  { slug: 'sets', nameUz: "To'plamlar", nameRu: 'Наборы', icon: <Package size={18} /> },
];

export const SORT_OPTIONS = [
  { value: 'featured', labelUz: "Tavsiya etilgan", labelRu: "Рекомендуемые" },
  { value: 'price_asc', labelUz: "Arzon → Qimmat", labelRu: "Дешевле → Дороже" },
  { value: 'price_desc', labelUz: "Qimmat → Arzon", labelRu: "Дороже → Дешевле" },
  { value: 'rating', labelUz: "Reyting bo'yicha", labelRu: "По рейтингу" },
  { value: 'newest', labelUz: "Eng yangi", labelRu: "Новинки" },
];

interface Product {
  id: string;
  nameUz: string;
  nameRu: string;
  slug: string;
  price: number;
  oldPrice?: number | null;
  images: string[];
  rating: number;
  reviewCount: number;
  isOnSale?: boolean;
  category?: { nameUz: string; slug: string };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
