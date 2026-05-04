import type { Metadata } from 'next';

const DOMAIN = 'https://microgreenuzbekistan.com';

export const metadata: Metadata = {
  title: "Katalog — Mikroko'katlar, salatlar, gullar, gidroponika | Restoran, kafe, HoReCa ta'minoti",
  description: "Barcha mahsulotlar katalogi: mikroko'katlar (rukkola, bazilik, shpinat, brokkoli, redis, no'xat), salatlar, gullar, urug'lar, substratlar, o'g'itlar, gidroponika va aeroponika uskunalari. Restoranlar, kafelar, mehmonxonalar uchun B2B zelen ta'minoti. ZOJ, PP, sog'lom ovqatlanish, ozish, detoks uchun superfud. Каталог микрозелени — доставка по Самарканду. Снабжение ресторанов, кафе. ЗОЖ, ПП, похудение, нутрициология.",
  keywords: [
    // UZ
    "mikroko'katlar katalogi", "mikrozelen katalog", "salatlar Samarqand",
    "gullar buyurtma", "urug'lar sotib olish", "gidroponika uskunalari",
    "aeroponika", "restoran ta'minoti", "kafe ta'minoti", "HoReCa zelen",
    "ulgurji zelen", "B2B mikroko'kat", "ZOJ", "PP", "superfud",
    "ozish", "dieta", "sog'lom ovqat", "nutritsiolog",
    "rukkola", "bazilik", "shpinat", "brokkoli", "redis", "no'xat",
    "qulupnay", "karam", "petrushka", "ukrop",
    "taom dekor", "restoran dekor", "banket bezash",
    "vertikal fermerchilik", "mini ferma", "fitolampalar",
    // RU
    "каталог микрозелени", "микрозелень купить Самарканд", "салаты доставка",
    "зелень для ресторана", "снабжение кафе", "HoReCa поставки",
    "гидропоника купить", "аэропоника", "семена микрозелени",
    "ЗОЖ", "ПП", "похудение", "здоровое питание", "нутрициолог",
    "руккола", "базилик", "шпинат", "брокколи", "клубника",
    "декор блюд", "съедобные цветы", "гарнир микрозелень",
    "суперфуд", "детокс", "фитнес питание", "смузи",
    // EN
    "microgreens catalog Uzbekistan", "buy microgreens Samarkand",
    "restaurant supply", "hydroponics equipment",
  ],
  alternates: {
    canonical: `${DOMAIN}/catalog`,
  },
  openGraph: {
    title: "Katalog — Microgreen Uzbekistan | Restoran, kafe, ZOJ, PP",
    description: "Organik mikroko'katlar, salatlar, gullar, gidroponika — keng tanlash. Restoranlar, kafelar uchun B2B. ZOJ, PP, ozish uchun superfud. Samarqandda tezkor yetkazib berish.",
    url: `${DOMAIN}/catalog`,
    type: 'website',
    images: [{ url: `${DOMAIN}/hero-microgreens.png`, width: 1200, height: 630 }],
  },
};

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
