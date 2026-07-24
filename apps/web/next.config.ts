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
  serverExternalPackages: ["@prisma/client", "bcrypt"],
  typescript: {
    ignoreBuildErrors: true,
  },

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
            key: "Content-Security-Policy",
            // media-src задан явно: без него видео подчиняется default-src 'self',
            // и blob: отклоняется («Media load rejected by URL safety check»).
            // blob: нужен админке — постер ролика снимается из выбранного файла
            // в браузере, потому что на сервере нет ffmpeg.
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://telegram.org https://oauth.telegram.org https://www.googletagmanager.com https://www.google-analytics.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; media-src 'self' blob:; connect-src 'self' https://www.google-analytics.com https://api.telegram.org https://oauth.telegram.org https://*.googleapis.com https://dl.polyhaven.org https://poly.pizza https://graph.instagram.com; frame-src 'self' https://telegram.org https://oauth.telegram.org; worker-src 'self' blob:;",
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
