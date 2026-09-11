// Рубрики, размер страницы и варианты сортировки каталога.
// Файл .tsx: у рубрик есть иконки, то есть JSX.

import { Droplet, Leaf, Package, Salad } from 'lucide-react';

export const PAGE_SIZE = 24;

/**
 * Линейки — «для кого», второй ряд фильтров.
 *
 * НЕ КАТЕГОРИИ. Категория у товара одна и отвечает на «что это»: лоток
 * микрозелени, упаковка бейби-листа, набор. Линеек у товара несколько —
 * шпинат служит и детской, и ежедневной, и домашней кухне, — поэтому они
 * живут отдельным списком `Product.lines` и своим фильтром.
 *
 * Коллекций (FAOL, ISHDA, MEHMON, SOVG'A) здесь нет намеренно: они живут
 * внутри линеек, и десять чипов в ряд читать невозможно.
 */
export const LINES = [
  { slug: '', nameUz: 'Barcha liniyalar', nameRu: 'Все линейки' },
  { slug: 'BALANS', nameUz: 'BALANS', nameRu: 'BALANS' },
  { slug: 'KUNLIK', nameUz: 'KUNLIK', nameRu: 'KUNLIK' },
  { slug: 'OSHXONA', nameUz: 'OSHXONA', nameRu: 'OSHXONA' },
  { slug: 'CHEF', nameUz: 'CHEF', nameRu: 'CHEF' },
  { slug: 'BOLAJON', nameUz: 'BOLAJON', nameRu: 'BOLAJON' },
];

export const CATEGORIES = [
  { slug: '', nameUz: 'Barchasi', nameRu: 'Все', icon: <Package size={18} /> },
  { slug: 'microgreens', nameUz: "Mikroko'katlar", nameRu: 'Микрозелень', icon: <Leaf size={18} /> },
  { slug: 'baby-leaf', nameUz: 'Baby Leaf', nameRu: 'Бейби лист', icon: <Leaf size={18} /> },
  { slug: 'salads', nameUz: 'Salatlar', nameRu: 'Салаты', icon: <Leaf size={18} /> },
  { slug: 'balans', nameUz: 'BALANS', nameRu: 'BALANS', icon: <Salad size={18} /> },
  { slug: 'sauces', nameUz: 'Souslar', nameRu: 'Соусы', icon: <Droplet size={18} /> },
  { slug: 'sets', nameUz: "To'plamlar", nameRu: 'Наборы', icon: <Package size={18} /> },
];

export const SORT_OPTIONS = [
  { value: 'featured', labelUz: "Tavsiya etilgan", labelRu: "Рекомендуемые" },
  { value: 'price_asc', labelUz: "Arzon → Qimmat", labelRu: "Дешевле → Дороже" },
  { value: 'price_desc', labelUz: "Qimmat → Arzon", labelRu: "Дороже → Дешевле" },
  { value: 'rating', labelUz: "Reyting bo'yicha", labelRu: "По рейтингу" },
  { value: 'newest', labelUz: "Eng yangi", labelRu: "Новинки" },
];

export interface Product {
  id: string;
  nameUz: string;
  nameRu: string;
  slug: string;
  price: number;
  oldPrice?: number | null;
  /**
   * За что назначена цена: «лоток», «100 г», «кг».
   *
   * У категорий она разная, и без неё «Фризе — 200 000 сум» читается как цена
   * за один кочан. Цена без единицы вводит в заблуждение сильнее, чем её
   * отсутствие.
   */
  unit?: string | null;
  images: string[];
  rating: number;
  reviewCount: number;
  isOnSale?: boolean;
  category?: { nameUz: string; slug: string };
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
