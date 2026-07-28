import type { Metadata } from 'next';
import Script from 'next/script';
import { jsonLdScript } from '@/lib/seo/jsonLd';

const SITE = process.env.NEXT_PUBLIC_URL || 'https://microgreenuzbekistan.com';

export const metadata: Metadata = {
  title: {
    template: '%s — FRESH WEEKLY',
    default: 'FRESH WEEKLY — Журнал о еде, ресторанах и здоровье',
  },
  description: 'Еженедельный интерактивный журнал: рестораны Ташкента и Самарканда, стрит-фуд мира, рецепты для шефов и хозяек, нутрициология, фитнес, IT-стартапы. С дополненной реальностью!',
  keywords: [
    'FRESH WEEKLY', 'журнал о еде', 'рестораны Ташкента', 'рестораны Самарканда',
    'микрозелень', 'рецепты', 'нутрициология', 'AR', 'дополненная реальность',
    'ovqat jurnali', 'Toshkent restoranlari', 'mikrozeleny',
  ],
  alternates: {
    canonical: `${SITE}/magazine`,
  },
  openGraph: {
    title: 'FRESH WEEKLY — Интерактивный журнал о еде',
    description: 'Интерактивный журнал о еде, здоровье и технологиях. Рестораны, рецепты, AR-коллекция персонажей. Читайте онлайн, скачивайте PDF или закажите печатную копию.',
    type: 'article',
    url: `${SITE}/magazine`,
    siteName: 'Microgreen Uzbekistan',
    locale: 'ru_RU',
    images: [{ url: '/img/og-magazine.jpg', width: 1200, height: 630, alt: 'FRESH WEEKLY журнал' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FRESH WEEKLY — Журнал о еде, ресторанах и здоровье',
    description: 'Еженедельный интерактивный журнал с дополненной реальностью — рестораны, рецепты, здоровье.',
    images: ['/img/og-magazine.jpg'],
  },
};

// JSON-LD structured data for Google rich snippets
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Periodical',
  name: 'FRESH WEEKLY',
  description: 'Еженедельный интерактивный журнал о еде, ресторанах и здоровье от Microgreen Uzbekistan.',
  url: `${SITE}/magazine`,
  publisher: {
    '@type': 'Organization',
    name: 'Microgreen Uzbekistan',
    url: SITE,
    logo: { '@type': 'ImageObject', url: `${SITE}/logo.svg` },
  },
  inLanguage: ['ru', 'uz'],
  isAccessibleForFree: true,
};

export default function MagazineLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Script
        id="magazine-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
        strategy="afterInteractive"
      />
      {children}
    </>
  );
}
