// Recently-viewed products — localStorage-backed, most recent first.
// Snapshot enough of the product to render a ProductCard without a fetch.

export interface ViewedProduct {
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

const KEY = 'Microgreen_recently_viewed';
const MAX = 12;

export function trackViewed(p: ViewedProduct) {
  if (typeof window === 'undefined') return;
  try {
    const list: ViewedProduct[] = JSON.parse(localStorage.getItem(KEY) || '[]');
    const next = [p, ...list.filter((x) => x.id !== p.id)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* quota/parse errors are non-fatal */ }
}

export function getViewed(excludeId?: string): ViewedProduct[] {
  if (typeof window === 'undefined') return [];
  try {
    const list: ViewedProduct[] = JSON.parse(localStorage.getItem(KEY) || '[]');
    return excludeId ? list.filter((x) => x.id !== excludeId) : list;
  } catch {
    return [];
  }
}
