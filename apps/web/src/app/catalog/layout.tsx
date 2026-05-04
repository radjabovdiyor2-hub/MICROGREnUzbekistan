import type { Metadata } from 'next';

const DOMAIN = 'https://microgreenuzbekistan.com';

export const metadata: Metadata = {
  title: "Katalog — Mikroko'katlar, salatlar, gullar, urug'lar",
  description: "Barcha mahsulotlar katalogi: mikroko'katlar, salatlar, gullar, urug'lar, substratlar, o'g'itlar, uskunalar. Samarqandda yetkazib berish. Каталог микрозелени, салатов, цветов — доставка по Самарканду.",
  keywords: [
    "mikroko'katlar katalogi", "mikrozelen katalog", "salatlar Samarqand",
    "gullar buyurtma", "urug'lar sotib olish", "gidroponika uskunalari",
    "каталог микрозелени", "микрозелень купить Самарканд", "салаты доставка",
    "microgreens catalog Uzbekistan",
  ],
  alternates: {
    canonical: `${DOMAIN}/catalog`,
  },
  openGraph: {
    title: "Katalog — Microgreen Uzbekistan",
    description: "Organik mikroko'katlar, salatlar, gullar — keng tanlash. Samarqandda tezkor yetkazib berish.",
    url: `${DOMAIN}/catalog`,
    type: 'website',
    images: [{ url: `${DOMAIN}/hero-microgreens.png`, width: 1200, height: 630 }],
  },
};

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
