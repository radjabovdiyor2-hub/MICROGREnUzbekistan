// ════════════════════════════════════════════════════════════
// SEO-контент категорийных лендингов /catalog/<slug>.
// Уникальные title/description/H1/вводный текст на каждую категорию —
// именно они дают странице шанс ранжироваться отдельно, а не как дубль
// /catalog. Двуязычно: узбекский основной, русский следом.
// ════════════════════════════════════════════════════════════

export interface CategorySeo {
  slug: string;
  h1Uz: string;
  h1Ru: string;
  title: string;        // <title>, до ~60 символов основного смысла
  description: string;  // <meta description>, до ~160
  introUz: string;      // вводный абзац на странице (для веса и пользы)
  introRu: string;
  keywords: string[];
}

export const CATEGORY_SEO: Record<string, CategorySeo> = {
  microgreens: {
    slug: 'microgreens',
    h1Uz: "Mikroko'katlar — yangi, organik, Samarqandda yetkazib berish",
    h1Ru: 'Микрозелень — свежая, органическая, доставка по Самарканду',
    title: "Микрозелень купить в Самарканде — руккола, базилик, брокколи | Доставка",
    description: "Свежая микрозелень с доставкой по Самарканду и Узбекистану: руккола, базилик, брокколи, редис, горох. Срезка в день заказа. Оптом для ресторанов и кафе.",
    introUz: "Mikroko'kat — bu urug'dan endi chiqqan, 7–14 kunlik nihol. Aynan shu davrda o'simlikda vitamin va mineral zaxirasi eng yuqori. Biz uni yopiq fermada, pestitsidsiz yetishtiramiz va buyurtma kuni kesib yetkazamiz. Salatlar, sendvichlar, garnir va restoran taomlarini bezash uchun ideal.",
    introRu: "Микрозелень — это росток 7–14 дней от посева, когда в растении максимум витаминов и минералов. Мы выращиваем её в закрытой ферме без пестицидов и срезаем в день заказа. Идеальна для салатов, сэндвичей, гарнира и украшения ресторанных блюд. Доставка по Самарканду за 30–90 минут, оптовые поставки для HoReCa.",
    keywords: ["mikroko'kat", 'микрозелень купить', 'микрозелень Самарканд', 'руккола', 'базилик', 'брокколи', 'редис', 'горох микрозелень', 'microgreens Uzbekistan'],
  },
  'baby-leaf': {
    slug: 'baby-leaf',
    h1Uz: 'Baby Leaf — yosh salat barglari',
    h1Ru: 'Бейби лист — молодые листья салата',
    title: 'Бейби лист (Baby Leaf) купить в Самарканде — молодые салатные листья',
    description: "Нежные молодые листья салата Baby Leaf: мягкий вкус, готовы к подаче. Свежая срезка, доставка по Самарканду, оптом для ресторанов и кафе.",
    introUz: "Baby Leaf — bu yosh, nozik salat barglari. Ular oddiy salatdan yumshoqroq va shirinroq, yuvishga deyarli hojat yo'q. Salatlar, burger va sendvichlar uchun tayyor asos.",
    introRu: "Baby Leaf — молодые нежные листья салата с мягким, чуть сладковатым вкусом. Почти не требуют мытья и готовы к подаче. Отличная основа для салатов, бургеров и сэндвичей. Свежая срезка и доставка по Самарканду.",
    keywords: ['baby leaf', 'бейби лист', 'молодой салат', 'салатные листья', 'салат Самарканд'],
  },
  salads: {
    slug: 'salads',
    h1Uz: "Salatlar — Bacio, Romano, Latuk, Rukkola",
    h1Ru: 'Салаты — Бацио, Романо, Латук, Руккола',
    title: 'Салаты купить в Самарканде — Бацио, Романо, Латук, Руккола | Доставка',
    description: "Свежие листовые салаты с доставкой по Самарканду: Бацио, Романо, Латук, Руккола, Айсберг, Лолло Россо. Для дома и ресторанов, опт HoReCa.",
    introUz: "Bizda listli salatlarning keng tanlovi: Bacio, Romano, Latuk, Rukkola, Aйsberg, Lollo Rosso va boshqalar. Barchasi yangi kesilgan, xrustlı va shirali. Uy va restoranlar uchun.",
    introRu: "Широкий выбор листовых салатов: Бацио, Романо, Латук, Руккола, Айсберг, Лолло Россо и другие. Все свежесрезанные, хрустящие и сочные. Для дома и для ресторанов — с регулярными оптовыми поставками.",
    keywords: ['салат бацио', 'салат романо', 'салат латук', 'руккола свежая', 'салат айсберг', 'лолло россо', 'салаты Самарканд'],
  },
  flowers: {
    slug: 'flowers',
    h1Uz: 'Yeyiladigan gullar — taom va restoran dekori',
    h1Ru: 'Съедобные цветы — декор блюд и ресторанов',
    title: 'Съедобные цветы купить в Самарканде — декор блюд и банкетов',
    description: "Съедобные цветы для украшения блюд, тортов и банкетов: настурция, виола, бархатцы. Свежие, безопасные, доставка по Самарканду. Опт для ресторанов.",
    introUz: "Yeyiladigan gullar taom va shirinliklarni chinakam san'at asariga aylantiradi. Nastursiya, viola va boshqa gullar — xavfsiz, yangi va yorqin. Banket va restoran dekori uchun.",
    introRu: "Съедобные цветы превращают блюдо или десерт в произведение искусства. Настурция, виола, бархатцы — безопасные, свежие и яркие. Для банкетов, тортов и ресторанного декора. Доставка по Самарканду.",
    keywords: ['съедобные цветы', 'цветы для декора', 'декор блюд', 'украшение тарелки', 'цветы Самарканд', 'настурция'],
  },
  seeds: {
    slug: 'seeds',
    h1Uz: "Urug'lar — mikroko'kat o'stirish uchun",
    h1Ru: 'Семена — для выращивания микрозелени',
    title: 'Семена микрозелени купить в Узбекистане — для выращивания дома',
    description: "Проверенные семена микрозелени с высокой всхожестью: руккола, горох, подсолнечник, брокколи, редис. Для выращивания дома и на ферме. Доставка по Узбекистану.",
    introUz: "Uy sharoitida yoki fermada mikroko'kat o'stirish uchun sifatli, unuvchanligi yuqori urug'lar. Rukkola, no'xat, kungaboqar, brokkoli, redis va boshqalar.",
    introRu: "Качественные семена с высокой всхожестью для выращивания микрозелени дома или на ферме: руккола, горох, подсолнечник, брокколи, редис и другие. Подробные инструкции по проращиванию.",
    keywords: ['семена микрозелени', "urug'lar", 'семена для проращивания', 'семена руккола', 'семена гороха', 'выращивание микрозелени'],
  },
  equipment: {
    slug: 'equipment',
    h1Uz: 'Uskunalar — gidroponika, aeroponika, fitolampalar',
    h1Ru: 'Оборудование — гидропоника, аэропоника, фитолампы',
    title: 'Оборудование для микрозелени — гидропоника, фитолампы, лотки | Самарканд',
    description: "Оборудование для выращивания микрозелени: гидропонные системы, аэропоника, фитолампы, лотки, субстраты, удобрения. Доставка по Узбекистану, консультация.",
    introUz: "Mikroko'kat va gullarni o'stirish uchun barcha uskunalar: gidroponika va aeroponika tizimlari, LED fitolampalar, laganlar, substratlar va o'g'itlar. Uy va tijorat fermasi uchun.",
    introRu: "Всё для выращивания микрозелени и цветов: гидропонные и аэропонные системы, LED-фитолампы, лотки, субстраты и удобрения. Для дома и для коммерческой фермы. Поможем подобрать комплект под вашу задачу.",
    keywords: ['гидропоника купить', 'аэропоника', 'фитолампа', 'оборудование для микрозелени', 'субстрат', 'удобрения', 'grow box'],
  },
  sets: {
    slug: 'sets',
    h1Uz: "To'plamlar — uyda o'stirish uchun tayyor komplekt",
    h1Ru: 'Наборы — готовые комплекты для выращивания дома',
    title: 'Наборы для выращивания микрозелени дома — стартовые и детские | Самарканд',
    description: "Готовые наборы для выращивания микрозелени дома: семена, субстрат, лоток и инструкция. Стартовые, семейные и детские комплекты. Доставка по Самарканду.",
    introUz: "Uyda mikroko'kat o'stirishni boshlash uchun tayyor to'plamlar: urug', substrat, lagan va qadamba-qadam yo'riqnoma. Boshlang'ich, oilaviy va bolalar uchun komplektlar.",
    introRu: "Готовые наборы, чтобы начать выращивать микрозелень дома без опыта: семена, субстрат, лоток и пошаговая инструкция. Есть стартовые, семейные и детские комплекты — отличная идея для подарка и для занятий с детьми.",
    keywords: ['набор для микрозелени', 'выращивание дома', 'стартовый набор', 'детский набор микрозелень', "to'plam mikroko'kat"],
  },
  services: {
    slug: 'services',
    h1Uz: 'Xizmatlar — B2B ta’minot, konsalting, franshiza',
    h1Ru: 'Услуги — B2B снабжение, консалтинг, франшиза',
    title: 'Услуги Microgreen Uzbekistan — B2B снабжение ресторанов, консалтинг, франшиза',
    description: "Услуги для бизнеса: регулярное B2B снабжение ресторанов и кафе микрозеленью, консалтинг по выращиванию, обучение и франшиза. Самарканд, Узбекистан.",
    introUz: "Biznes uchun xizmatlar: restoran va kafelarni muntazam mikroko'kat bilan ta'minlash, yetishtirish bo'yicha konsalting, o'quv kurslari va franshiza. Barqaror hamkorlik shartlari.",
    introRu: "Услуги для бизнеса: регулярное снабжение ресторанов и кафе микрозеленью по B2B-ценам, консалтинг по выращиванию, обучающие курсы и франшиза. Прозрачные условия долгосрочного партнёрства.",
    keywords: ['B2B микрозелень', 'снабжение ресторанов', 'HoReCa поставки', 'консалтинг микрозелень', 'франшиза', 'обучение выращиванию'],
  },
};

export const CATEGORY_SLUGS = Object.keys(CATEGORY_SEO);
