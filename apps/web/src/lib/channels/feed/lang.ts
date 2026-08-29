import type { FeedLang } from './items';

/**
 * Язык фида из строки запроса.
 *
 * По умолчанию узбекский: публичный контент и SEO ведутся на нём, и
 * Merchant просит фид на языке рынка. Мусор в параметре — тоже узбекский,
 * а не отказ: площадка не должна остаться без фида из-за опечатки в URL.
 */
export function feedLang(raw: string | null): FeedLang {
  return raw === 'ru' ? 'ru' : 'uz';
}

/** Полчаса в кэше — столько же, сколько живёт кэш каталога у площадок. */
export const FEED_CACHE = 'public, s-maxage=1800, stale-while-revalidate=3600';
