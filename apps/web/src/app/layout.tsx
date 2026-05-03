import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { CartProvider } from '@/components/providers/CartProvider';
import { FavoritesProvider } from '@/components/providers/FavoritesProvider';
import { LangProvider } from '@/components/providers/LangProvider';
import { AuthProvider } from '@/components/providers/AuthProvider';
import { Header } from '@/components/layout/Header';
import { BottomNav } from '@/components/layout/BottomNav';
import { LazyAiChat } from '@/components/ai/LazyAiChat';
import { PwaRegister } from '@/components/providers/PwaRegister';

const DOMAIN = 'https://microgreenuzbekistan.com';

export const metadata: Metadata = {
  metadataBase: new URL(DOMAIN),
  title: {
    default: "Microgreen Uzbekistan — Mikroko'katlar, salatlar, gullar va sog'lom oziq-ovqat | Samarqand",
    template: "%s | Microgreen Uzbekistan",
  },
  description: "Mikroko'katlar, salatlar, gullar, urug'lar va gidroponika uskunalari — Samarqandda yetkazib berish. Restoranlar uchun B2B ta'minot. Sog'lom hayot (ZOJ), organik oziq-ovqat, superfud. O'zbekistonda #1 mikroko'kat do'koni.",
  keywords: [
    // Uzbek keywords
    "mikroko'katlar", "mikrozelen", "salatlar", "gullar", "urug'lar",
    "gidroponika", "substrat", "o'g'itlar", "organik oziq-ovqat",
    "sog'lom hayot", "sog'lom ovqatlanish", "ZOJ", "superfud",
    "vertikal fermerchilik", "urban fermerchilik",
    "restoran uchun zelen", "kafe uchun mikroko'kat",
    "Samarqand yetkazib berish", "O'zbekiston",
    // Russian keywords (popular in Uzbekistan)
    "микрозелень Узбекистан", "микрозелень Самарканд", 
    "салаты свежие", "цветы Самарканд",
    "здоровое питание", "ЗОЖ", "суперфуд",
    "ресторан зелень", "кафе микрозелень",
    "органическая еда", "экологичные продукты",
    "гидропоника", "семена микрозелени",
    "руккола", "горох микрозелень", "подсолнечник",
    "базилик", "брокколи", "редис микрозелень",
    // English (international SEO)
    "microgreens Uzbekistan", "microgreens Samarkand",
    "organic food Uzbekistan", "healthy food delivery",
    "restaurant greens supply", "B2B microgreens",
  ],
  manifest: '/manifest.json',
  alternates: {
    canonical: DOMAIN,
    languages: {
      'uz-UZ': DOMAIN,
      'ru-RU': `${DOMAIN}?lang=ru`,
    },
  },
  openGraph: {
    title: "Microgreen Uzbekistan — Sog'lom hayot uchun yangi mikroko'katlar",
    description: "Organik mikroko'katlar, salatlar, gullar, urug'lar. Restoranlar va uylar uchun yetkazib berish. Samarqand, O'zbekiston.",
    type: 'website',
    locale: 'uz_UZ',
    alternateLocale: ['ru_RU'],
    siteName: 'Microgreen Uzbekistan',
    url: DOMAIN,
    images: [
      {
        url: `${DOMAIN}/hero-microgreens.png`,
        width: 1200,
        height: 630,
        alt: "Microgreen Uzbekistan — yangi mikroko'katlar",
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: "Microgreen Uzbekistan — Organik mikroko'katlar",
    description: "Sog'lom hayot uchun yangi mikroko'katlar va salatlar. Samarqandda yetkazib berish.",
    images: [`${DOMAIN}/hero-microgreens.png`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Microgreen',
  },
  verification: {
    // Add Google Search Console verification when available
    // google: 'your-verification-code',
  },
  category: 'food',
  other: {
    'geo.region': 'UZ-SA',
    'geo.placename': 'Samarkand',
    'geo.position': '39.6542;66.9597',
    'ICBM': '39.6542, 66.9597',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0B14' },
  ],
};

// JSON-LD structured data for Google Rich Snippets
function JsonLd() {
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${DOMAIN}/#organization`,
        name: 'Microgreen Uzbekistan',
        url: DOMAIN,
        logo: `${DOMAIN}/logo.png`,
        description: "O'zbekistonda #1 mikroko'katlar, salatlar, gullar va gidroponika uskunalari do'koni",
        address: {
          '@type': 'PostalAddress',
          streetAddress: 'Ray Senter',
          addressLocality: 'Samarqand',
          addressCountry: 'UZ',
        },
        contactPoint: {
          '@type': 'ContactPoint',
          telephone: '+998-94-999-95-99',
          contactType: 'sales',
          availableLanguage: ['uz', 'ru'],
        },
        sameAs: [
          'https://t.me/MicrogreenUzbekistan',
          'https://t.me/Microgreen_Uzbekistan',
          'https://www.instagram.com/microgreenuzbekistan',
        ],
      },
      {
        '@type': 'WebSite',
        '@id': `${DOMAIN}/#website`,
        url: DOMAIN,
        name: 'Microgreen Uzbekistan',
        publisher: { '@id': `${DOMAIN}/#organization` },
        potentialAction: {
          '@type': 'SearchAction',
          target: `${DOMAIN}/catalog?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'LocalBusiness',
        '@id': `${DOMAIN}/#localbusiness`,
        name: 'Microgreen Uzbekistan',
        image: `${DOMAIN}/hero-microgreens.png`,
        url: DOMAIN,
        telephone: '+998949999599',
        priceRange: '$$',
        address: {
          '@type': 'PostalAddress',
          streetAddress: 'Ray Senter',
          addressLocality: 'Samarqand',
          addressRegion: 'Samarkand',
          postalCode: '140100',
          addressCountry: 'UZ',
        },
        geo: {
          '@type': 'GeoCoordinates',
          latitude: 39.6542,
          longitude: 66.9597,
        },
        openingHoursSpecification: {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
          opens: '08:00',
          closes: '22:00',
        },
        servesCuisine: ['Healthy Food', 'Organic', 'Microgreens', 'Salads'],
        menu: `${DOMAIN}/catalog`,
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: "Mikroko'katlar nima va ular nima uchun foydali?",
            acceptedAnswer: {
              '@type': 'Answer',
              text: "Mikroko'katlar — bu yosh o'simliklar (7-14 kun), oddiy sabzavotlarga nisbatan 4-40 marta ko'p vitaminlar va minerallar saqlaydi. Ular sog'lom ovqatlanish, immunitetni mustahkamlash va restoran taomlarini bezash uchun ideal.",
            },
          },
          {
            '@type': 'Question',
            name: "Samarqandda yetkazib berish qancha vaqt oladi?",
            acceptedAnswer: {
              '@type': 'Answer',
              text: "Samarqand bo'ylab 1-2 soat ichida tezkor yetkazib berish. Buyurtma 50,000 so'mdan oshsa yetkazib berish bepul!",
            },
          },
          {
            '@type': 'Question',
            name: "Restoranlar uchun ulgurji (B2B) narxlar bormi?",
            acceptedAnswer: {
              '@type': 'Answer',
              text: "Ha! Restoranlar, kafelar va mehmonxonalar uchun maxsus B2B narxlar va muntazam yetkazib berish rejasi mavjud. +998 94 999 95 99 ga qo'ng'iroq qiling.",
            },
          },
        ],
      },
    ],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uz" suppressHydrationWarning>
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
        <JsonLd />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('Microgreen-theme');if(t){document.documentElement.setAttribute('data-theme',t)}else{var d=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';document.documentElement.setAttribute('data-theme',d)}}catch(e){document.documentElement.setAttribute('data-theme','light')}})()`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <LangProvider>
            <CartProvider>
              <FavoritesProvider>
                <AuthProvider>
                  <Header />
                  <main style={{ paddingTop: 'var(--header-height)', paddingBottom: 'var(--bottom-nav-height)' }}>
                    {children}
                  </main>
                  <BottomNav />
                  <LazyAiChat />
                  <PwaRegister />
                </AuthProvider>
              </FavoritesProvider>
            </CartProvider>
          </LangProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
