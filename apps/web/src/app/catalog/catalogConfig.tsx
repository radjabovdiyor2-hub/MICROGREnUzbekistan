// Рубрики, размер страницы и варианты сортировки каталога.
// Файл .tsx: у рубрик есть иконки, то есть JSX.

import { Droplet, Leaf, Package, Salad } from 'lucide-react';

export const PAGE_SIZE = 24;

/**
 * Разделы каталога — ОДИН ряд, но два разных фильтра за ним.
 *
 * `category` отвечает на «что это»: лоток микрозелени, упаковка бейби-листа,
 * бутылка соуса. У товара она одна.
 *
 * `line` отвечает на «для кого»: KUNLIK, OSHXONA, CHEF, BOLAJON. Линеек у
 * товара несколько — один и тот же шпинат служит и детской, и ежедневной, и
 * домашней кухне, поэтому они живут списком `Product.lines`, а не рубрикой.
 *
 * ПОКУПАТЕЛЮ ЭТО РАЗЛИЧИЕ НЕ НУЖНО. Он видит один ряд разделов и нажимает
 * тот, что ищет; какой из двух фильтров за ним стоит — наша забота. Два
 * отдельных ряда заставляли его выбирать дважды и гадать, чем они
 * отличаются.
 *
 * Выбор всегда ОДИН: нажатие на раздел сбрасывает прежний, иначе «Салаты +
 * BOLAJON» дали бы пустой экран и вид сломанного фильтра.
 *
 * BALANS остаётся рубрикой, а не линейкой: у него своя упаковка и своя
 * страница метода. Линейки встают сразу за ним — так просил владелец, и так
 * оно читается: сначала что это, потом для кого.
 */
export interface Chip {
  kind: 'category' | 'line';
  slug: string;
  nameUz: string;
  nameRu: string;
  icon?: React.ReactNode;
}

export const CHIPS: Chip[] = [
  { kind: 'category', slug: '', nameUz: 'Barchasi', nameRu: 'Все', icon: <Package size={18} /> },
  { kind: 'category', slug: 'microgreens', nameUz: "Mikroko'katlar", nameRu: 'Микрозелень', icon: <Leaf size={18} /> },
  { kind: 'category', slug: 'baby-leaf', nameUz: 'Baby Leaf', nameRu: 'Бейби лист', icon: <Leaf size={18} /> },
  { kind: 'category', slug: 'salads', nameUz: 'Salatlar', nameRu: 'Салаты', icon: <Leaf size={18} /> },
  { kind: 'category', slug: 'balans', nameUz: 'BALANS', nameRu: 'BALANS', icon: <Salad size={18} /> },
  { kind: 'line', slug: 'KUNLIK', nameUz: 'KUNLIK', nameRu: 'KUNLIK' },
  { kind: 'line', slug: 'OSHXONA', nameUz: 'OSHXONA', nameRu: 'OSHXONA' },
  { kind: 'line', slug: 'CHEF', nameUz: 'CHEF', nameRu: 'CHEF' },
  { kind: 'line', slug: 'BOLAJON', nameUz: 'BOLAJON', nameRu: 'BOLAJON' },
  { kind: 'category', slug: 'sauces', nameUz: 'Souslar', nameRu: 'Соусы', icon: <Droplet size={18} /> },
  { kind: 'category', slug: 'sets', nameUz: "To'plamlar", nameRu: 'Наборы', icon: <Package size={18} /> },
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
