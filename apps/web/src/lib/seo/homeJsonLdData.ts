const DOMAIN = 'https://microgreenuzbekistan.com';

export const HOME_JSON_LD_DATA = {
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
        addressCountry: 'UZ',
      },
      geo: {
        '@type': 'GeoCoordinates',
        latitude: 39.6542,
        longitude: 66.9597,
      },
      openingHoursSpecification: [
        {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
          opens: '08:00',
          closes: '20:00',
        },
      ],
    },
    {
      '@type': 'FAQPage',
      '@id': `${DOMAIN}/#faq`,
      mainEntity: [
        {
          '@type': 'Question',
          name: "Mikroko'katlar nima? / Что такое микрозелень?",
          acceptedAnswer: {
            '@type': 'Answer',
            text: "Mikroko'kat — urug'dan chiqqan 7-14 kunlik nihol: birinchi haqiqiy barglar ochilganda kesiladi. Past kaloriya, kam uglevod, kletchatka va vitaminlar manbai. Микрозелень — росток 7-14 дней от посева, срезанный при появлении первых настоящих листьев. Низкая калорийность, мало углеводов, источник клетчатки и витаминов.",
          },
        },
        {
          '@type': 'Question',
          name: "Restoranlar va HoReCa uchun yetkazib berish bormi? / Есть ли доставка для ресторанов и HoReCa?",
          acceptedAnswer: {
            '@type': 'Answer',
            text: "Ha! Samarqand va O'zbekiston bo'ylab restoranlar, kafelar va mehmonxonalar uchun ulgurji narxlarda har kuni yangi uzilgan mikroko'katlar, salatlar va gullar yetkazib beramiz. Да! Ежедневные поставки свежей микрозелени, салатов и съедобных цветов для ресторанов по оптовым ценам.",
          },
        },
        {
          '@type': 'Question',
          name: "Gidroponika va uyda yetishtirish uchun uskunalar bormi? / Есть ли оборудование для гидропоники?",
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
            text: "Salatlar, smuzilar, sendvichlar, sushi, garnirlar va 100+ retsept. BALANS liniyasida tayyor 100 g mikslar bor: asosiy taomdan oldin beriladi. Салаты, смузи, сэндвичи, суши, гарниры и более 100 рецептов. В линейке BALANS — готовые миксы 100 г, которые подают перед основным блюдом.",
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
