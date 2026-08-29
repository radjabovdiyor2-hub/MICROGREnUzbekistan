import { JsonLd } from './jsonLd';
import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { CartProvider } from '@/components/providers/CartProvider';
import { FavoritesProvider } from '@/components/providers/FavoritesProvider';
import { LangProvider } from '@/components/providers/LangProvider';
import { AuthProvider } from '@/components/providers/AuthProvider';
import { AppShell } from '@/components/layout/AppShell';
import { ReactQueryProvider } from '@/components/providers/ReactQueryProvider';
import { PwaRegister } from '@/components/providers/PwaRegister';
import { ReferralCapture } from '@/components/providers/ReferralCapture';
import { TelegramInit } from '@/components/providers/TelegramInit';
import { Analytics } from '@/components/providers/Analytics';
import { CityProvider } from '@/components/providers/CityProvider';
import { SEO_KEYWORDS } from '@/lib/seo/keywordsData';

const DOMAIN = 'https://microgreenuzbekistan.com';


export const metadata: Metadata = {
  metadataBase: new URL(DOMAIN),
  title: {
    default: "Микрозелень в Узбекистане — Купить свежую микрозелень, семена и наборы | Microgreen Uzbekistan (Самарканд)",
    template: "%s | Microgreen Uzbekistan",
  },
  description: "Купить свежую микрозелень, семена, лотки, фитолампы и наборы для выращивания с доставкой по Самарканду и Узбекистану. Поставки для ресторанов (HoReCa) и здорового питания (ЗОЖ, ПП). 100% Эко качество.",
  keywords: SEO_KEYWORDS,
  manifest: '/manifest.json',
  alternates: {
    canonical: DOMAIN,
    // Только uz-UZ: ?lang=ru не отдельная страница (язык переключает клиентский
    // LangProvider), Google канонизирует её в / — alternate указывал бы сам на
    // себя. Локализованная главная появится вместе с /ru- и /uz-роутингом.
    languages: {
      'uz-UZ': DOMAIN,
    },
  },
  openGraph: {
    title: "Microgreen Uzbekistan — Restoranlar, kafelar uchun yangi zelen | ZOJ, PP, sog'lom ovqat",
    description: "Organik mikroko'katlar, salatlar, gullar, urug'lar. Restoranlar, kafelar va uylar uchun yetkazib berish. Gidroponika, aeroponika. Samarqand, O'zbekiston.",
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
        alt: "Microgreen Uzbekistan — yangi mikroko'katlar, restoranlar uchun zelen ta'minoti",
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: "Microgreen Uzbekistan — Organik mikroko'katlar, ZOJ, restoran ta'minoti",
    description: "Sog'lom hayot uchun yangi mikroko'katlar, salatlar, gidroponika. Restoranlar uchun B2B. Samarqandda yetkazib berish.",
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
    google: process.env.NEXT_PUBLIC_GSC_VERIFICATION || undefined,
    other: process.env.NEXT_PUBLIC_YANDEX_VERIFICATION
      ? { 'yandex-verification': process.env.NEXT_PUBLIC_YANDEX_VERIFICATION }
      : undefined,
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
    // Литералы намеренно: themeColor уходит в манифест PWA и в мета-тег,
    // который читает системный браузер — CSS-переменных там нет.
    // Цвет системной панели браузера. Next отдаёт его в <meta name="theme-color">,
    // где var() не работает — значение обязано быть литералом.
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0B14' },
  ],
};

// JSON-LD structured data for Google Rich Snippets

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nonce = (await headers()).get('x-nonce') ?? '';
  return (
    <html lang="uz" suppressHydrationWarning>
      <head>
        {/* Performance: Preconnect to critical origins */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Performance: Preload hero image for fast LCP */}
        <link rel="preload" as="image" href="/hero-microgreens.webp" type="image/webp" fetchPriority="high" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
        <JsonLd />
        {/* SDK Telegram — только тем, кто пришёл ИЗ Telegram.
            Он весит 114 КБ и грузился всем подряд, хотя нужен лишь внутри
            мини-приложения: обычный посетитель сайта платил за него на
            каждой странице, включая экран входа в админку.

            Признак — параметры `tgWebApp*`, которые Telegram дописывает в
            адрес при открытии. Они есть только на первом шаге, поэтому
            запоминаем факт на вкладку: внутренние переходы адрес меняют.

            Домен разрешён в `script-src` явно, так что подставлять nonce
            добавленному тегу не нужно. Все потребители (`haptic`, шапка,
            `TelegramInit`) читают `window.Telegram?.WebApp` через `?.` и
            отсутствие SDK переносят молча — снаружи Telegram его и раньше
            не было ничего, кроме самого файла. */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k='mg-tg-app';var inTg=/tgWebApp/.test(location.hash)||/tgWebApp/.test(location.search)||sessionStorage.getItem(k)==='1';if(!inTg)return;sessionStorage.setItem(k,'1');var s=document.createElement('script');s.src='https://telegram.org/js/telegram-web-app.js';s.async=true;document.head.appendChild(s)}catch(e){}})()`,
          }}
        />
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('Microgreen-theme');if(t){document.documentElement.setAttribute('data-theme',t)}else{var d=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';document.documentElement.setAttribute('data-theme',d)}}catch(e){document.documentElement.setAttribute('data-theme','light')}})()`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <LangProvider>
            <CityProvider>
              <CartProvider>
                <FavoritesProvider>
                  <AuthProvider>
                    <ReactQueryProvider>
                      <AppShell>
                        {children}
                      </AppShell>
                    </ReactQueryProvider>
                    <PwaRegister />
                    <ReferralCapture />
                    <TelegramInit />
                    <Analytics
                      ymId={process.env.NEXT_PUBLIC_YM_ID || process.env.YM_ID}
                      gaId={process.env.NEXT_PUBLIC_GA_ID || process.env.GA_ID}
                    />
                  </AuthProvider>
                </FavoritesProvider>
              </CartProvider>
            </CityProvider>
          </LangProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
