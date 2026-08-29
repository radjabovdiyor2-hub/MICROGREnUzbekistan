import { MetadataRoute } from 'next';

// ══════════════════════════════════════════════════════════════════════
// Правила для роботов.
//
// Товарные фиды лежат на `/feed/*`, а НЕ под `/api/` — весь `/api/` здесь
// закрыт, и фид оттуда Merchant просто не заберёт.
//
// Роботы ИИ-поисковиков выписаны явно. Общее правило `*` их и так
// разрешало, но молча: первый же новый `disallow` в общем правиле отрезал
// бы товар от ChatGPT и Perplexity, и заметить это было бы нечем.
// ══════════════════════════════════════════════════════════════════════

const SITE = 'https://microgreenuzbekistan.com';

/** Роботы, которым нужен и каталог, и фиды. */
const AI_CRAWLERS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'PerplexityBot'];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api/', '/_next/'],
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: ['/admin', '/api/'],
      },
      {
        userAgent: 'Googlebot-Image',
        allow: '/',
      },
      {
        userAgent: 'Yandexbot',
        allow: '/',
        disallow: ['/admin', '/api/'],
      },
      {
        userAgent: 'Bingbot',
        allow: '/',
        disallow: ['/admin', '/api/'],
      },
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: ['/', '/feed/'],
        disallow: ['/admin', '/api/'],
      })),
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
