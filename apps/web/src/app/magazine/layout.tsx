import type { Metadata } from 'next';
import Script from 'next/script';
import { jsonLdScript } from '@/lib/seo/jsonLd';

const SITE = process.env.NEXT_PUBLIC_URL || 'https://microgreenuzbekistan.com';

export const metadata: Metadata = {
  title: {
    template: '%s — FRESH WEEKLY',
    default: 'FRESH WEEKLY — журнал о еде, здоровье и доме',
  },
  description: 'Журнал Microgreen Uzbekistan: рецепты с микрозеленью, рестораны Самарканда и Ташкента, здоровье, советы хозяйке, скидки и наборы к салатам. Печатный номер — онлайн и в PDF.',
  keywords: [
    'FRESH WEEKLY', 'журнал о еде', 'рестораны Самарканда', 'рестораны Ташкента',
    'микрозелень', 'рецепты с микрозеленью', 'здоровое питание', 'советы хозяйке',
    'ovqat jurnali', 'Samarqand restoranlari', "mikroko'kat", 'retseptlar',
  ],
  alternates: {
    canonical: `${SITE}/magazine`,
  },
  openGraph: {
    title: 'FRESH WEEKLY — журнал о еде, здоровье и доме',
    description: 'Рецепты, рестораны, здоровье и советы хозяйке. Читайте онлайн, скачивайте PDF или закажите печатный номер.',
    type: 'article',
    url: `${SITE}/magazine`,
    siteName: 'Microgreen Uzbekistan',
    locale: 'ru_RU',
    images: [{ url: '/img/og-magazine.jpg', width: 1200, height: 630, alt: 'FRESH WEEKLY журнал' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FRESH WEEKLY — журнал о еде, здоровье и доме',
    description: 'Рецепты, рестораны, здоровье и советы хозяйке — журнал Microgreen Uzbekistan.',
    images: ['/img/og-magazine.jpg'],
  },
};

// JSON-LD structured data for Google rich snippets
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Periodical',
  name: 'FRESH WEEKLY',
  description: 'Журнал о еде, здоровье и доме от Microgreen Uzbekistan: рецепты, рестораны, советы хозяйке.',
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
