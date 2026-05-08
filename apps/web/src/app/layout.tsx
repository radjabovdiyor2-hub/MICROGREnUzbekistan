import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { CartProvider } from '@/components/providers/CartProvider';
import { FavoritesProvider } from '@/components/providers/FavoritesProvider';
import { LangProvider } from '@/components/providers/LangProvider';
import { AuthProvider } from '@/components/providers/AuthProvider';
import { AppShell } from '@/components/layout/AppShell';
import { PwaRegister } from '@/components/providers/PwaRegister';
import { Analytics } from '@/components/providers/Analytics';

const DOMAIN = 'https://microgreenuzbekistan.com';

export const metadata: Metadata = {
  metadataBase: new URL(DOMAIN),
  title: {
    default: "Microgreen Uzbekistan — Mikroko'katlar, salatlar, zelen, gullar | Restoran ta'minoti | ZOJ, PP, sog'lom ovqatlanish | Samarqand",
    template: "%s | Microgreen Uzbekistan",
  },
  description: "Mikroko'katlar, salatlar, gullar, urug'lar, gidroponika, aeroponika uskunalari — Samarqandda yetkazib berish. Restoranlar, kafelar, mehmonxonalar uchun B2B zelen ta'minoti. Sog'lom hayot (ZOJ), PP, organik superfud, nутрициология, ozish uchun sog'lom ovqat. Rukkola, bazilik, shpinat, brokkoli, redis, no'xat, qulupnay. O'zbekistonda #1 mikroko'kat do'koni.",
  keywords: [
    // ═══════════ UZBEK — Primary keywords ═══════════
    "mikroko'katlar", "mikrozelen", "salatlar", "gullar", "urug'lar",
    "zelen", "ko'kat", "sabzavotlar", "mevalar",
    // Растения по названию
    "rukkola", "bazilik", "shpinat", "brokkoli", "redis",
    "no'xat mikroko'kat", "kungaboqar mikroko'kat", "lavlagi",
    "karam", "petrushka", "ukrop", "kashnich", "mint", "yalpiz",
    "beda", "arpa ko'kati", "bug'doy ko'kati", "qulupnay",
    // ЗОЖ / Здоровье
    "sog'lom hayot", "sog'lom ovqatlanish", "ZOJ", "PP", "superfud",
    "ozish", "vazn yo'qotish", "dieta", "detoks", "vitaminlar",
    "immunitet", "antioksidantlar", "organik oziq-ovqat",
    "kaloriya kam", "oqsilga boy", "tolaga boy ovqat",
    "nutritsiolog", "sog'lom taomnoma", "fitnes ovqat",
    // Ресторан / Кафе / HoReCa
    "restoran uchun zelen", "kafe uchun mikroko'kat",
    "restoran ta'minoti", "HoReCa ta'minot", "ulgurji zelen",
    "mehmonxona uchun salatlar", "banket bezash", "taom bezash",
    "oshxona uchun zelen", "shef-povarga", "garnir uchun",
    // Декор
    "taom dekor", "restoran dekor", "ovqat bezash",
    "tarelka bezash", "gullar dekor",
    // Гидропоника / Аэропоника / Фермерство
    "gidroponika", "aeroponika", "vertikal fermerchilik",
    "urban fermerchilik", "substrat", "o'g'itlar",
    "uy sharoitida yetishtirish", "mini ferma",
    "LED lampalar", "grow box", "fitolampalar",
    // Локация
    "Samarqand yetkazib berish", "Samarqand zelen",
    "O'zbekiston", "Toshkent", "Buxoro",

    // ═══════════ RUSSIAN — All target keywords ═══════════
    // Микрозелень
    "микрозелень Узбекистан", "микрозелень Самарканд", "микрозелень купить",
    "микрозелень доставка", "микрозелень оптом", "свежая микрозелень",
    "микрозелень для ресторанов", "микрозелень для кафе",
    // Растения
    "руккола", "базилик", "шпинат", "брокколи", "редис микрозелень",
    "горох микрозелень", "подсолнечник", "кресс-салат",
    "капуста", "петрушка", "укроп", "кинза", "мята",
    "ячмень ростки", "пшеница ростки", "клубника",
    // Салаты
    "салаты свежие", "салат микс", "зелень свежая", "зелень Самарканд",
    "листовой салат", "салат для ресторана",
    // ЗОЖ / ПП / Похудение
    "здоровое питание", "ЗОЖ", "ПП рецепты", "правильное питание",
    "суперфуд", "детокс", "похудение", "здоровое похудение",
    "диета", "снижение веса", "нутрициолог", "нутрициология",
    "витамины", "антиоксиданты", "иммунитет",
    "низкокалорийная еда", "белковая еда", "клетчатка",
    "фитнес питание", "спортивное питание", "смузи",
    // Ресторан / Кафе / Снабжение
    "ресторан зелень", "кафе микрозелень", "снабжение ресторанов",
    "поставщик зелени", "зелень оптом", "HoReCa поставки",
    "оптом для ресторанов", "B2B микрозелень",
    "шеф-повар зелень", "гарнир микрозелень",
    "банкет зелень", "кейтеринг зелень",
    // Декор
    "декор блюд", "украшение тарелки", "декор ресторана",
    "цветы для декора", "цветы Самарканд", "съедобные цветы",
    // Гидропоника / Аэропоника
    "гидропоника", "аэропоника", "вертикальная ферма",
    "городское фермерство", "семена микрозелени",
    "субстрат для микрозелени", "удобрения",
    "выращивание дома", "мини ферма", "фитолампа",
    // Готовка / Кухня
    "рецепты с микрозеленью", "готовка", "кулинария",
    "здоровые рецепты", "ПП рецепты", "салат рецепт",
    "органическая еда", "экологичные продукты",
    "фермерские продукты", "без ГМО",

    // ═══════════ ENGLISH — International SEO ═══════════
    "microgreens Uzbekistan", "microgreens Samarkand",
    "organic food Uzbekistan", "healthy food delivery",
    "restaurant greens supply", "B2B microgreens",
    "hydroponics Uzbekistan", "aeroponics", "vertical farming",
    "superfood", "detox greens", "healthy eating",
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
        servesCuisine: ['Healthy Food', 'Organic', 'Microgreens', 'Salads', 'Superfoods'],
        menu: `${DOMAIN}/catalog`,
        hasOfferCatalog: {
          '@type': 'OfferCatalog',
          name: "Microgreen Uzbekistan — mahsulotlar katalogi",
          itemListElement: [
            { '@type': 'OfferCatalog', name: "Микрозелень (Microgreens)", url: `${DOMAIN}/catalog?category=microgreens` },
            { '@type': 'OfferCatalog', name: "Бейби лист (Baby Leaf)", url: `${DOMAIN}/catalog?category=baby-leaf` },
            { '@type': 'OfferCatalog', name: "Салаты (Salads)", url: `${DOMAIN}/catalog?category=salads` },
            { '@type': 'OfferCatalog', name: "Цветы (Flowers)", url: `${DOMAIN}/catalog?category=flowers` },
            { '@type': 'OfferCatalog', name: "Семена (Seeds)", url: `${DOMAIN}/catalog?category=seeds` },
            { '@type': 'OfferCatalog', name: "Оборудование — Гидропоника, Аэропоника", url: `${DOMAIN}/catalog?category=equipment` },
            { '@type': 'OfferCatalog', name: "Наборы (Sets)", url: `${DOMAIN}/catalog?category=sets` },
          ],
        },
        keywords: 'микрозелень, microgreens, салаты, ЗОЖ, ПП, похудение, ресторан, кафе, снабжение, гидропоника, аэропоника, нутрициолог',
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: "Mikroko'katlar nima va ular nima uchun foydali? / Что такое микрозелень и чем она полезна?",
            acceptedAnswer: {
              '@type': 'Answer',
              text: "Mikroko'katlar — bu yosh o'simliklar (7-14 kun), oddiy sabzavotlarga nisbatan 4-40 marta ko'p vitaminlar va minerallar saqlaydi. Ular sog'lom ovqatlanish (ZOJ, PP), immunitetni mustahkamlash, ozish va restoran taomlarini bezash uchun ideal. Микрозелень содержит в 4-40 раз больше витаминов и минералов чем обычные овощи.",
            },
          },
          {
            '@type': 'Question',
            name: "Samarqandda yetkazib berish qancha vaqt oladi? / Сколько времени занимает доставка по Самарканду?",
            acceptedAnswer: {
              '@type': 'Answer',
              text: "Samarqand bo'ylab 30-90 daqiqada tezkor yetkazib berish. Buyurtma 500,000 so'mdan oshsa yetkazib berish bepul! Доставка по Самарканду за 30-90 минут. Бесплатная доставка от 500 000 сум.",
            },
          },
          {
            '@type': 'Question',
            name: "Restoranlar va kafelar uchun B2B ta'minot bormi? / Есть ли оптовые поставки для ресторанов и кафе?",
            acceptedAnswer: {
              '@type': 'Answer',
              text: "Ha! Restoranlar, kafelar, mehmonxonalar va katering xizmatlari uchun maxsus B2B narxlar, muntazam yetkazib berish rejasi va HoReCa ta'minot mavjud. Да! Специальные B2B цены и регулярные поставки для ресторанов, кафе, гостиниц и кейтеринга. Звоните: +998 94 999 95 99.",
            },
          },
          {
            '@type': 'Question',
            name: "Mikroko'katlar ozish (vazn yo'qotish) uchun foydali bo'ladimi? / Помогает ли микрозелень при похудении?",
            acceptedAnswer: {
              '@type': 'Answer',
              text: "Ha! Mikroko'katlar — kaloriyasi kam, tolaga boy, vitaminlarga to'la superfud. ZOJ va PP (sog'lom ovqatlanish) uchun ideal. Nutritsiologlar tomonidan tavsiya etiladi. Да! Микрозелень — низкокалорийный суперфуд, богатый клетчаткой и витаминами. Идеален для ЗОЖ, ПП и здорового похудения. Рекомендован нутрициологами.",
            },
          },
          {
            '@type': 'Question',
            name: "Qanday turdagi mikroko'katlar bor? / Какие виды микрозелени есть?",
            acceptedAnswer: {
              '@type': 'Answer',
              text: "Bizda rukkola, bazilik, shpinat, brokkoli, redis, no'xat, kungaboqar, lavlagi, karam, bug'doy ko'kati, arpa ko'kati va boshqa 20+ tur mavjud. У нас руккола, базилик, шпинат, брокколи, редис, горох, подсолнечник, капуста, ростки пшеницы и ячменя и более 20 видов.",
            },
          },
          {
            '@type': 'Question',
            name: "Gidroponika va aeroponika uskunalari sotiladi? / Продаётся ли оборудование для гидропоники и аэропоники?",
            acceptedAnswer: {
              '@type': 'Answer',
              text: "Ha! Gidroponika, aeroponika, vertikal fermerchilik uchun uskunalar, substratlar, o'g'itlar, LED fitolampalar, urug'lar va mini ferma to'plamlarini sotamiz. Да! Продаём оборудование для гидропоники, аэропоники, вертикального фермерства: субстраты, удобрения, фитолампы, семена и наборы для мини-фермы.",
            },
          },
          {
            '@type': 'Question',
            name: "Taom bezash va restoran dekor uchun gullar bormi? / Есть ли цветы для декора блюд и ресторанов?",
            acceptedAnswer: {
              '@type': 'Answer',
              text: "Ha! Yeyiladigan gullar (edible flowers), taom bezash uchun dekor elementlari, banket va tarelka bezash uchun maxsus gullar mavjud. Да! Съедобные цветы для украшения блюд и тарелок, декор для банкетов и ресторанов.",
            },
          },
          {
            '@type': 'Question',
            name: "Uyda mikroko'kat yetishtirishni o'rgatiladi? / Можно ли научиться выращивать микрозелень дома?",
            acceptedAnswer: {
              '@type': 'Answer',
              text: "Ha! Bizda uy sharoitida yetishtirish uchun grow box to'plamlar, urug'lar va to'liq qo'llanmalar mavjud. Mini ferma boshlash uchun hamma narsa. Да! У нас есть наборы для домашнего выращивания, семена и полные инструкции для создания мини-фермы дома.",
            },
          },
          {
            '@type': 'Question',
            name: "Mikroko'katlar bilan qanday taomlar tayyorlanadi? / Какие блюда можно приготовить с микрозеленью?",
            acceptedAnswer: {
              '@type': 'Answer',
              text: "Salatlar, smuzlar, sendvichlar, sushlar, garnirlar, detoks ichimliklar va boshqa 100+ PP retseptlar. Shef-povarlar uchun taom bezash va garnir sifatida ham ishlatiladi. Салаты, смузи, сэндвичи, суши, гарниры, детокс-напитки и более 100 ПП-рецептов. Шеф-повара используют для украшения и гарнира.",
            },
          },
          {
            '@type': 'Question',
            name: "Qulupnay (klubnika) va boshqa mevalar bormi? / Есть ли клубника и другие фрукты?",
            acceptedAnswer: {
              '@type': 'Answer',
              text: "Ha! Organik qulupnay va mavsumiy mevalar ham mavjud. Gidroponika texnologiyasi bilan yetishtirilib, kimyoviy moddalar ishlatilmaydi. Да! Органическая клубника и сезонные фрукты. Выращены на гидропонике без химикатов.",
            },
          },
          {
            '@type': 'Question',
            name: "Nutritsiolog bilan maslahatlashish mumkinmi? / Можно ли проконсультироваться с нутрициологом?",
            acceptedAnswer: {
              '@type': 'Answer',
              text: "Ha! Bizning AI-nутрициолог xizmati saytda mavjud. Sog'lom taomnoma, dieta, ZOJ va PP bo'yicha maslahat olishingiz mumkin. Да! Наш AI-нутрициолог доступен на сайте. Консультации по здоровому питанию, диете, ЗОЖ и ПП.",
            },
          },
          {
            '@type': 'Question',
            name: "Toshkent va boshqa shaharlarga yetkazib beriladi? / Есть ли доставка в Ташкент и другие города?",
            acceptedAnswer: {
              '@type': 'Answer',
              text: "Hozirda Samarqand bo'ylab tezkor yetkazib berish. Toshkent, Buxoro va boshqa shaharlarga maxsus buyurtma asosida yetkazamiz. Сейчас экспресс-доставка по Самарканду. В Ташкент, Бухару и другие города — по специальному заказу.",
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
        {/* Performance: Preconnect to critical origins */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Performance: Preload hero image for fast LCP */}
        <link rel="preload" as="image" href="/hero-microgreens.webp" type="image/webp" fetchPriority="high" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
        <JsonLd />
        <script src="https://telegram.org/js/telegram-web-app.js" async></script>
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
                  <AppShell>
                    {children}
                  </AppShell>
                  <PwaRegister />
                  <Analytics />
                </AuthProvider>
              </FavoritesProvider>
            </CartProvider>
          </LangProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
