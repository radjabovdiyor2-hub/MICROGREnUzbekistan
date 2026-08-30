import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
    // `optimizePackageImports` здесь ПРОБОВАЛИ и убрали: измеренной пользы
    // ноль. Главная, каталог и корзина весили 278, 267 и 268 КБ скриптов и
    // с ним, и без него — побайтово. Next 16 уже разбирает индексный импорт
    // lucide сам, а framer-motion в этом проекте и так грузится по месту.
    //
    // Оставлять настройку, которая ничего не делает, вреднее, чем не иметь
    // её: следующий человек решит, что рычаг уже дёрнут.
  },
  // Workspace packages resolve through node_modules (@repo/database -> dist,
  // @repo/shared -> src, transpiled here). Do NOT re-alias them in turbopack/
  // webpack: Turbopack fails to resolve absolute-path aliases and the prod
  // build dies with "Module not found" (tsconfig `paths` covers type-checking).
  transpilePackages: ['@repo/shared', '@repo/database'],
  serverExternalPackages: ["@prisma/client", "bcrypt", "ioredis"],
  // ignoreBuildErrors УБРАН: он пропускал ошибки типов в прод, хотя в форме
  // Due Diligence strict mode заявлен как средство их отлова (§4.3, §6.2).
  // На текущем коде `tsc --noEmit` проходит без ошибок, так что флаг только
  // маскировал бы будущие регрессии.

  // Optimize images — prefer WebP/AVIF, smaller sizes
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 31536000, // 1 year
    deviceSizes: [640, 750, 828, 1080],   // only mobile + tablet widths
    imageSizes: [128, 256, 384],           // thumbnail sizes for product cards
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.pixabay.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
      // Instagram CDN
      { protocol: 'https', hostname: '**.cdninstagram.com' },
      { protocol: 'https', hostname: '**.fbcdn.net' },
    ],
  },

  async headers() {
    return [
      // Static assets — immutable cache (1 year)
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      // Images — long cache
      {
        source: "/images/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      // Icons and manifest — moderate cache.
      //
      // Правило было одно, `/(icons|manifest.json|og-image.png)`, и НЕ
      // РАБОТАЛО: безымянная группа в `source` не разворачивается в
      // альтернативу путей, и манифест попадал под общее «no-store» ниже.
      // Браузер перекачивал его на каждую загрузку страницы — вместе с
      // иконками, на которые он ссылается.
      //
      // Проверяется руками: `curl -I /manifest.json` должен показывать
      // неделю, а не `no-store`. Заметить иначе нельзя — ошибок нет.
      {
        source: "/manifest.json",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=2592000",
          },
        ],
      },
      {
        source: "/manifest-admin.json",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=2592000",
          },
        ],
      },
      {
        source: "/icons/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=2592000",
          },
        ],
      },
      // Воркер MapLibre (public/maplibre/*) — 489 КБ на пару файлов.
      // Без своего правила он попадает под общее «no-store» ниже и
      // перекачивается на каждую загрузку страницы с картой.
      //
      // Сутки с ревалидацией, а НЕ immutable: после обновления maplibre-gl
      // старый воркер из кэша и новый главный бандл разойдутся по протоколу,
      // и карта снова почернеет. Ценой одного 304 в сутки этого не случится.
      {
        source: "/maplibre/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, must-revalidate",
          },
        ],
      },
      // Service Worker — NEVER cache (must always be fresh)
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
      // Fonts — long cache
      {
        source: "/:path*.woff2",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      // Next.js data prefetch (JSON) — very short cache
      {
        source: "/_next/data/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
      // ── Каталог товаров: полминуты в кэше ────────────────────────────
      //
      // Каталог рисуется на клиенте: сначала приходит страница, потом
      // отдельным запросом товары. То есть покупатель ждёт ДВА круга до
      // сервера подряд, и второй — четверть секунды.
      //
      // Ответ одинаков для всех: в роуте нет ни сессии, ни cookie, ни
      // договорных цен. Значит кэшировать его безопасно, в том числе
      // общим прокси, если он однажды появится.
      //
      // Полминуты — правка цены доходит до витрины почти сразу, а не
      // «когда-нибудь». Остаток запаса товара за это время устареть может,
      // но заказ всё равно проверяет наличие на сервере: витрина здесь
      // показывает, а не решает.
      //
      // `/api/products/export` под это правило НЕ попадает — он для
      // владельца, и там выгрузка, а не витрина.
      {
        source: "/api/products",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=30, stale-while-revalidate=120",
          },
        ],
      },
      // API routes — no cache
      {
        source: "/api/:path((?!products$).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate",
          },
        ],
      },
      // All pages — security headers + short cache for HTML
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            // camera=(self) — кадр гостя в живом меню (/m/<slug>/frame/<code>):
            // гость снимает блюдо прямо со страницы. Здесь была ссылка на
            // AR-сканер /magazine/ar, которого в приложении нет.
            // Со сторонних origin камера по-прежнему закрыта
            value: "camera=(self), microphone=(self), geolocation=()",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          {
            // CSP генерируется в middleware.ts с per-request nonce.
            // Статический CSP здесь убран — два CSP-заголовка пересекаются
            // по самому строгому, что сломало бы nonce-based скрипты.
            key: "X-Powered-By",
            value: "",
          },
        ],
      },
      // ── Витрина: минута в кэше браузера ──────────────────────────────
      //
      // Каталог, карточка товара, журнал и рецепты одинаковы для всех и
      // меняются не чаще, чем правят прайс. С `no-store` каждый переход
      // «назад» и каждое повторное открытие ждали полного ответа сервера —
      // около 0,4 с только до первого байта, на телефоне в 3G заметно.
      //
      // `private` — принципиально: кэширует ТОЛЬКО браузер покупателя, а
      // не общий прокси. Даже если на странице однажды появится имя
      // вошедшего, чужому оно не достанется.
      //
      // Минута, а не час: правку цены владелец увидит на витрине сразу
      // после следующего обновления, а не будет гадать, почему не видно.
      // `stale-while-revalidate` отдаёт старое мгновенно и обновляет
      // фоном — переход выглядит мгновенным даже на исходе минуты.
      {
        source: "/:path(|catalog|magazine)",
        headers: [
          {
            key: "Cache-Control",
            value: "private, max-age=60, stale-while-revalidate=300",
          },
        ],
      },
      {
        source: "/:section(catalog|product|recipe|magazine)/:rest*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, max-age=60, stale-while-revalidate=300",
          },
        ],
      },
      // HTML pages — ALWAYS fresh (no stale content)
      //
      // Всё остальное: корзина, избранное, кабинет, баланс, админка.
      // Там либо личные данные, либо состояние, устаревание которого
      // человек примет за поломку — «положил в корзину, а её нет».
      // Исключения перечислены явно: витринные правила выше их уже
      // покрыли, а два `Cache-Control` в одном ответе браузер сводит к
      // самому строгому, то есть к `no-store` — и послабление не сработало
      // бы вовсе.
      {
        source: "/:path((?!api|_next|images|icons|maplibre|manifest|catalog|product|recipe|magazine).+)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Pragma",
            value: "no-cache",
          },
          {
            key: "Expires",
            value: "0",
          },
        ],
      },
    ];
  },
};

// ────────────────── Sentry Integration (optional) ──────────────────
let exportedConfig: NextConfig = nextConfig;

try {
  if (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN) {
    // Dynamic import so the app still works without @sentry/nextjs installed
    const { withSentryConfig } = require("@sentry/nextjs");
    exportedConfig = withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: true,
      widenClientFileUpload: true,
      disableLogger: true,
    });
  }
} catch {
  // @sentry/nextjs not installed — use base config
}

export default exportedConfig;
