import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
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
      // Icons and manifest — moderate cache
      {
        source: "/(icons|manifest.json|og-image.png)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=2592000",
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
      // API routes — no cache
      {
        source: "/api/:path*",
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
            // camera=(self) — AR-сканер журнала (/magazine/ar) снимает
            // коллекционную карточку; со сторонних origin камера по-прежнему закрыта
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
      // HTML pages — ALWAYS fresh (no stale content)
      {
        source: "/:path((?!api|_next|images|icons).*)",
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
