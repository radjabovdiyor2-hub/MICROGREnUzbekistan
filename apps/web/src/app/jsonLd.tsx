// Микроразметка schema.org для главной: организация, магазин, товары,
// частые вопросы. Вынесена из layout.tsx — 195 строк статических данных,
// к разметке страницы отношения не имеющих.

import { jsonLdScript } from '@/lib/seo/jsonLd';

const DOMAIN = 'https://microgreenuzbekistan.com';

export function JsonLd() {
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
          'https://t.me/Microgreenuzbekistan_bot',
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
            { '@type': 'OfferCatalog', name: "Микрозелень (Microgreens)", url: `${DOMAIN}/catalog/microgreens` },
            { '@type': 'OfferCatalog', name: "Бейби лист (Baby Leaf)", url: `${DOMAIN}/catalog/baby-leaf` },
            { '@type': 'OfferCatalog', name: "Салаты (Salads)", url: `${DOMAIN}/catalog/salads` },
            { '@type': 'OfferCatalog', name: "Цветы (Flowers)", url: `${DOMAIN}/catalog/flowers` },
            { '@type': 'OfferCatalog', name: "Семена (Seeds)", url: `${DOMAIN}/catalog/seeds` },
            { '@type': 'OfferCatalog', name: "Оборудование — Гидропоника, Аэропоника", url: `${DOMAIN}/catalog/equipment` },
            { '@type': 'OfferCatalog', name: "Наборы (Sets)", url: `${DOMAIN}/catalog/sets` },
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
      dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }}
    />
  );
}
