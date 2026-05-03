import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ["@prisma/client", "bcrypt"],
  // @ts-ignore - Next.js types might be outdated
  eslint: {
    ignoreDuringBuilds: true,
  },
  // @ts-ignore - Next.js types might be outdated
  typescript: {
    ignoreBuildErrors: true,
  },

  // Optimize images — prefer WebP/AVIF, smaller sizes
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 31536000, // 1 year
    deviceSizes: [640, 750, 828, 1080],   // only mobile + tablet widths
    imageSizes: [128, 256, 384],           // thumbnail sizes for product cards
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
            value: "camera=(), microphone=(self), geolocation=()",
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
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://telegram.org https://www.googletagmanager.com https://www.google-analytics.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' https://www.google-analytics.com https://api.telegram.org https://*.googleapis.com https://dl.polyhaven.org https://poly.pizza; frame-src 'self' https://telegram.org; worker-src 'self' blob:;",
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
