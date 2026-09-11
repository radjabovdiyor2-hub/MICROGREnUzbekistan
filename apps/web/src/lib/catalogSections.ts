import type { LucideIcon } from 'lucide-react';
import {
  Baby, ChefHat, CookingPot, Droplet, LayoutGrid, Leaf, Package, Salad, Scale, Sprout, Sun,
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════
// Разделы каталога — ОДИН список на всю витрину.
//
// ЗАЧЕМ ОБЩИЙ ФАЙЛ. Списков было два: свой на главной, свой в каталоге. Они
// разошлись молча и сильно. Главная звала в «Цветы», «Семена» и
// «Оборудование» — три рубрики, где после перехода прайса на 70 позиций нет
// НИ ОДНОГО активного товара: человек нажимал и попадал в пустую комнату. И
// наоборот: соусов и четырёх линеек, которые в каталоге есть, на главной не
// было вовсе. Один список — расхождению негде появиться.
//
// ДВА ФИЛЬТРА ЗА ОДНИМ РЯДОМ. `category` отвечает на «что это» (лоток
// микрозелени, бутылка соуса) и у товара одна. `line` отвечает на «для кого»
// (KUNLIK, OSHXONA, CHEF, BOLAJON), и одна и та же зелень служит нескольким —
// поэтому линейки живут списком `Product.lines`, а не рубрикой. Покупателю
// это различие не нужно: он видит один ряд и нажимает то, что ищет.
//
// BALANS остаётся рубрикой: у него своя упаковка и своя страница метода.
// Линейки встают сразу за ним — сначала что это, потом для кого.
// ══════════════════════════════════════════════════════════════════════

export interface CatalogSection {
  kind: 'category' | 'line';
  slug: string;
  nameUz: string;
  nameRu: string;
  /**
   * ЗНАЧОК ОБЯЗАТЕЛЕН, а не «если найдётся».
   *
   * Пока поле было необязательным, четыре линейки приехали без него — и
   * поехала вся раскладка: значок сидит в коробке 44×44, и плитка без него
   * выходит ниже соседей. Ряд читался как случайный набор кнопок разного
   * роста. Тип закрывает эту дверь: раздел без значка не соберётся.
   *
   * Здесь КОМПОНЕНТ, а не готовый элемент: тот же раздел рисуется плиткой
   * (22 px) и строкой подвала (14 px), и размер выбирает место показа.
   */
  Icon: LucideIcon;
  /** Цвет плитки на главной. Токен, а не литерал: тема переключается. */
  color: string;
}

/**
 * Порядок ряда. Значки РАЗНЫЕ у разных разделов: три одинаковых листа подряд
 * не говорили ничего — если значок у всех один, он перестаёт быть подсказкой
 * и остаётся украшением.
 */
export const CATALOG_SECTIONS: CatalogSection[] = [
  { kind: 'category', slug: '', nameUz: 'Barchasi', nameRu: 'Все', Icon: LayoutGrid, color: 'var(--brand-primary)' },
  { kind: 'category', slug: 'microgreens', nameUz: "Mikroko'katlar", nameRu: 'Микрозелень', Icon: Sprout, color: 'var(--cat-10)' },
  { kind: 'category', slug: 'baby-leaf', nameUz: 'Baby Leaf', nameRu: 'Бейби лист', Icon: Leaf, color: 'var(--cat-7)' },
  { kind: 'category', slug: 'salads', nameUz: 'Salatlar', nameRu: 'Салаты', Icon: Salad, color: 'var(--cat-11)' },
  // Весы — про равновесие рациона, метод BALANS.
  { kind: 'category', slug: 'balans', nameUz: 'BALANS', nameRu: 'BALANS', Icon: Scale, color: 'var(--cat-2)' },
  // Линейки — про людей и повод: день, домашняя кухня, ресторан, ребёнок.
  { kind: 'line', slug: 'KUNLIK', nameUz: 'KUNLIK', nameRu: 'KUNLIK', Icon: Sun, color: 'var(--cat-6)' },
  { kind: 'line', slug: 'OSHXONA', nameUz: 'OSHXONA', nameRu: 'OSHXONA', Icon: CookingPot, color: 'var(--cat-12)' },
  { kind: 'line', slug: 'CHEF', nameUz: 'CHEF', nameRu: 'CHEF', Icon: ChefHat, color: 'var(--cat-1)' },
  { kind: 'line', slug: 'BOLAJON', nameUz: 'BOLAJON', nameRu: 'BOLAJON', Icon: Baby, color: 'var(--cat-3)' },
  { kind: 'category', slug: 'sauces', nameUz: 'Souslar', nameRu: 'Соусы', Icon: Droplet, color: 'var(--cat-4)' },
  { kind: 'category', slug: 'sets', nameUz: "To'plamlar", nameRu: 'Наборы', Icon: Package, color: 'var(--cat-8)' },
];

/**
 * Адрес раздела для ссылки с главной.
 *
 * У рубрики — своя страница `/catalog/<slug>`, у линейки страницы нет:
 * линейка это фильтр, и каталог читает его из `?line=` при первой же
 * отрисовке (`useCatalog`).
 */
export function sectionHref(section: CatalogSection): string {
  if (section.kind === 'line') return `/catalog?line=${section.slug}`;
  return section.slug ? `/catalog/${section.slug}` : '/catalog';
}
