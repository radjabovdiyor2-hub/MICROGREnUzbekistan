/**
 * FRESH WEEKLY — сборка ОДНОГО реального выпуска (publication-ready).
 *
 * Идемпотентно (upsert по slug / weekNumber / webSlug). Спеки инлайнятся как
 * JSON строго по интерфейсам apps/web/src/lib/magazine/types.ts (тип блока —
 * lowercase, поля плоские, статусы draft|ready|published). После прогона выпуск
 * открывается на /magazine/r/<webSlug> и /magazine/print/<webSlug>.
 *
 * Запуск:  cd packages/database && npx tsx prisma/seed-magazine-issue.ts
 *
 * В выпуске представлены ВСЕ аудиторные направления:
 *   · Мужские  — новости, AI-здоровье, фитнес
 *   · Женские  — рецепт, кухонные лайфхаки, выпечка, бьюти-тренды
 *   · Детские  — механика недели (AR-раскраска) + каталог 9 игр
 *   · Общие    — нутрициолог, tech-дайджест, AR-коллекция
 *   · Семья    — фермерская история + промо-конверсия (персональный блок)
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const WEEK = 1;
const SLUG = 'non-kabob';
const WEB_SLUG = `${SLUG}-w${WEEK}`;

// ── Общий 50% (одинаков для всех ресторанов недели) ─────────────────────────
const sharedSpec = {
  blocks: [
    // ── МУЖСКОЕ: новости недели ──
    {
      id: 'news', type: 'newsDigest', audience: 'men', origin: 'shared',
      title: 'Неделя в цифрах',
      items: [
        { title: 'Самарканд принял форум', text: 'В городе прошёл международный туристический форум — сезон обещает быть рекордным, спрос на локальную кухню растёт.' },
        { title: 'Ранний урожай зелени', text: 'Фермеры области сообщают: из-за тёплого мая базилик и редис в этом сезоне слаще обычного.' },
        { title: 'ЗОЖ на подъёме', text: 'Запросы «здоровый завтрак» в Узнете выросли на 40% за месяц — осознанное питание закрепляется как тренд.' },
      ],
    },
    // ── МУЖСКОЕ: AI-аналитика здоровья ──
    {
      id: 'health', type: 'healthTrends', audience: 'men', origin: 'shared',
      trendQuery: 'почему шелушится кожа на лице',
      factTitle: 'Факт недели',
      fact: 'Участились проблемы с кожей из-за сухого воздуха.',
      advice: 'Решение — Омега-3 и ростки редиса: в них витамина С больше, чем в лимоне.',
    },
    // ── МУЖСКОЕ: фитнес ──
    {
      id: 'fitness', type: 'fitness', audience: 'men', origin: 'shared',
      title: '10 минут утром, которые меняют весь день',
      intro: 'Короткая утренняя зарядка без инвентаря — заряд бодрости к завтраку.',
      exercises: [
        { name: 'Планка', text: '3 подхода по 30 секунд.' },
        { name: 'Приседания', text: '2 подхода по 15 повторений.' },
        { name: 'Бёрпи', text: '3 подхода по 8 — для сердца и тонуса.' },
      ],
    },
    // ── ЖЕНСКОЕ: рецепт недели ──
    {
      id: 'recipe', type: 'recipe', audience: 'women', origin: 'shared',
      title: 'Чизкейк «Цветочный сад»',
      heroImage: '',
      subtitle: 'Без выпечки · 20 мин + 4 часа холодильник',
      chefVersion: 'Крем-чиз 400г · греческий йогурт 200г · желатин + цедра лайма. Декор: микрозелень базилика + виола. Маржа в меню: 78%.',
      homeVersion: 'Творожный сыр 400г · йогурт 200г · желатин + лимон. Декор: клубника + мята. Бюджет: 45 000 сум.',
      steps: [
        { title: 'Шаг 1 · Основа', text: '200г печенья в крошку + 80г масла. Утрамбовать. Морозилка 15 мин.' },
        { title: 'Шаг 2 · Крем', text: 'Замочить желатин. Взбить крем-чиз + йогурт + пудра + цедра. Холодильник 4ч.' },
        { title: 'Шаг 3 · Магия', text: 'Ягоды по кругу → микрозелень → цветы виолы. Перед подачей.' },
      ],
    },
    // ── ЖЕНСКОЕ: кухонные лайфхаки ──
    {
      id: 'lifehacks', type: 'kitchenLifehacks', audience: 'women', origin: 'shared',
      title: 'Кухонные лайфхаки со всего мира',
      items: [
        { title: 'Чеснок за 5 секунд', text: 'Раздавите зубчик плоскостью ножа — шелуха отходит сама.' },
        { title: 'Пересолёный суп', text: 'Опустите сырую картофелину на 10 минут — заберёт лишнюю соль.' },
      ],
    },
    // ── ЖЕНСКОЕ: выпечка и десерты ──
    {
      id: 'baking', type: 'bakingDesserts', audience: 'women', origin: 'shared',
      title: 'Выпечка и десерты на выходные',
      intro: 'Рецепт, который под силу даже новичку.',
      items: [
        { title: 'Мягкое печенье с матчей', text: 'Матча + белый шоколад + микрозелень мяты для украшения. 15 минут в духовке.' },
        { title: 'Ягодный тарт', text: 'Песочная основа + крем-чиз + сезонные ягоды + съедобные цветы сверху.' },
      ],
    },
    // ── ЖЕНСКОЕ: бьюти-тренды ──
    {
      id: 'beauty', type: 'beautyTrends', audience: 'women', origin: 'shared',
      trendQuery: 'как убрать синяки под глазами',
      factTitle: 'Бьюти-тренд недели',
      fact: 'Всплеск запросов о тёмных кругах под глазами.',
      advice: 'Витамин K и железо: добавьте микрозелень гороха и свёклы в утренний смузи.',
    },
    // ── ОБЩЕЕ: нутрициолог ──
    {
      id: 'nutrition', type: 'nutritionist', audience: 'all', origin: 'shared',
      title: 'Витамин С: вы получаете его неправильно',
      fact: 'В болгарском перце витамина С в 3 раза больше, чем в лимоне. В микрозелени редиса — в 40 раз больше, чем во взрослой редиске.',
      tableTitle: 'ТОП-5 источников витамина С',
      table: [
        { rank: '1', product: 'Шиповник', per100: '650 мг', vs: '×13' },
        { rank: '2', product: 'Болг. перец', per100: '183 мг', vs: '×3.6' },
        { rank: '3', product: 'Киви', per100: '92 мг', vs: '×1.8' },
        { rank: '4', product: 'Брокколи', per100: '89 мг', vs: '×1.7' },
        { rank: '5', product: 'Лимон', per100: '53 мг', vs: '×1' },
      ],
      quote: 'Не пейте горячий чай с лимоном ради витамина С — он разрушается при 70°C.',
      quoteAttr: '— Колонка диетолога',
      lifehack: 'Нарежьте перец соломкой утром → контейнер → холодильник. Снэк весь день.',
    },
    // ── ОБЩЕЕ: tech-дайджест ──
    {
      id: 'tech', type: 'techDigest', audience: 'all', origin: 'shared',
      title: 'Технологии, которые меняют еду и здоровье',
      entries: [
        { icon: '🌍', kicker: 'Стартап мира', name: 'Zoe · UK', text: 'Персонализированное питание на основе анализа крови. AI-рекомендации.' },
        { icon: '🇺🇿', kicker: 'Стартап Узбекистана', name: 'Zira.uz', text: '5000+ рецептов с пошаговыми фото и доставкой продуктов в один клик.' },
        { icon: '⌚', kicker: 'Гаджет', name: 'Mi Band 9', text: 'Лучший фитнес-трекер до $40. Батарея 16 дней.' },
      ],
      aiHack: 'Напишите ИИ: «В холодильнике курица, помидоры, лук, рис — предложи 3 блюда за 20 минут».',
    },
    // ── ДЕТСКОЕ: механика недели (неделя 1 → AR-раскраска) ──
    {
      id: 'kids', type: 'kids', audience: 'kids', origin: 'shared',
      mechanic: 'ar_coloring',
      title: 'Маленький шеф',
      instruction: 'Сделай мордочку зверя из еды: половинка яблока — лицо, микрозелень — волосы, изюм — глаза.',
      riddle: 'Зелёный, кудрявый, витаминами богатый — что это? (ответь голосом боту)',
      tale: 'Жил-был Росточек по имени Кудрявчик. Однажды он проснулся на грядке под Самаркандом и решил: «Хочу попасть на самую красивую тарелку в городе!» Он пил утреннюю росу, ловил солнечные лучи — и рос, рос, рос. А когда шеф-повар срезал его и украсил блюдо, Кудрявчик засиял ярче всех. С тех пор он знает: чтобы стать особенным, нужно каждый день тянуться к солнцу.',
    },
    // ── ДЕТСКОЕ: каталог всех 9 игр ──
    {
      id: 'kids-catalog', type: 'kidsCatalog', audience: 'kids', origin: 'shared',
      title: 'Девять игр, где еда оживает',
      intro: 'Каждую неделю — новая механика. А все 9 доступны онлайн.',
    },
    // ── ОБЩЕЕ: коллекционная карточка + AR ──
    {
      id: 'collection', type: 'collectionAR', audience: 'all', origin: 'shared',
      cardName: 'Кинза',
      cardText: 'Наведи камеру на карточку — персонаж оживёт в 3D.',
      arUrl: '/magazine/ar',
    },
  ],
};

// ── Персональный 50% (под ресторан «Нон-кабоб») ─────────────────────────────
const personalSpec = {
  blocks: [
    {
      id: 'cover', type: 'cover', audience: 'all', origin: 'personal',
      title: 'Вкус Самарканда:', accentTitle: 'от грядки до тарелки',
      subtitle: 'Специальный выпуск для гостей «Нон-кабоб»',
      background: '',
      tags: ['Ресторан', 'Рецепты', 'ЗОЖ', 'Дети'],
    },
    {
      id: 'toc', type: 'toc', audience: 'all', origin: 'personal',
      editorialNote: 'Перед вами выпуск Fresh Weekly для гостей «Нон-кабоб». Каждую неделю — новый рецепт, новый лайфхак и немного магии для всей семьи. Приятного чтения.',
    },
    {
      id: 'chef', type: 'chefWord', audience: 'all', origin: 'personal',
      chefName: 'Шеф-повар «Нон-кабоб»',
      portrait: '',
      text: 'Дорогие гости! Мы верим, что еда — это забота. Каждое блюдо начинается с честных продуктов: мясо с локальных ферм, специи с самаркандского базара и микрозелень, срезанная за сутки до подачи. Открывайте этот выпуск как приглашение к столу — и пусть каждый кусочек будет в радость.',
    },
    {
      id: 'row', type: 'restaurantOfWeek', audience: 'all', origin: 'personal',
      name: 'Нон-кабоб',
      heroImage: '',
      meta: 'Наш гость недели · Самарканд',
      pullQuote: 'Красивая тарелка — это бесплатная реклама в Instagram.',
      quoteAttr: '— Шеф-повар «Нон-кабоб»',
      interview: [
        { q: 'Ваше фирменное блюдо?', a: 'Нон-кабоб на углях с зирой и гранатовым соусом. Секрет — маринад на минеральной воде и терпение: мясо отдыхает 12 часов.' },
        { q: 'Совет для домашней кухни?', a: 'Не бойтесь зелени. Горсть микрозелени редиса на готовое блюдо — и вкус, и польза, и вид как в ресторане.' },
      ],
      whatToOrder: 'Нон-кабоб · Люля на углях · Салат с микрозеленью',
      rating: 'Кухня ★★★★★ · Подача ★★★★★',
    },
    {
      id: 'family', type: 'familyConversion', audience: 'family', origin: 'personal',
      farmStory: 'Наша микрозелень растёт под Самаркандом и попадает на вашу тарелку в течение суток после срезки — без пестицидов, на чистой воде.',
      promoText: 'Понравилась зелень в «Нон-кабоб»? Закажите такую же домой со скидкой 15% по промокоду FRESH-NONKABOB.',
    },
  ],
};

async function main() {
  // 1. Ресторан-партнёр журнала (upsert по уникальному slug)
  const restaurant = await prisma.restaurant.upsert({
    where: { slug: SLUG },
    update: {
      isMagazinePartner: true,
      brandPrimary: '#C0392B',
      brandAccent: '#F1C40F',
      promoCode: 'FRESH-NONKABOB',
      promoDiscount: 15,
      menuItems: ['Нон-кабоб', 'Люля-кабоб', 'Салат с микрозеленью', 'Чизкейк «Цветочный сад»'],
    },
    create: {
      name: 'Нон-кабоб',
      slug: SLUG,
      city: 'samarkand',
      tier: 'premium',
      cuisine: ['uzbek'],
      dishes: ['Нон-кабоб', 'Люля-кабоб'],
      microgreens: ['редис', 'базилик', 'горох'],
      flowers: ['виола'],
      isPartner: true,
      isMagazinePartner: true,
      instagram: '@non_kabob',
      logo: '',
      brandPrimary: '#C0392B',
      brandAccent: '#F1C40F',
      promoCode: 'FRESH-NONKABOB',
      promoDiscount: 15,
      menuItems: ['Нон-кабоб', 'Люля-кабоб', 'Салат с микрозеленью', 'Чизкейк «Цветочный сад»'],
    },
  });

  // 2. Выпуск недели (общий 50%) — upsert по уникальному weekNumber
  const edition = await prisma.magazineEdition.upsert({
    where: { weekNumber: WEEK },
    update: { title: `FRESH WEEKLY #${WEEK}`, sharedSpec, isPublished: true, publishedAt: new Date() },
    create: {
      weekNumber: WEEK,
      title: `FRESH WEEKLY #${WEEK}`,
      coverTheme: 'Вкус Самарканда',
      sharedSpec,
      isPublished: true,
      publishedAt: new Date(),
    },
  });

  // 3. Персональный выпуск ресторана (персональный 50%) — upsert по webSlug
  const issue = await prisma.restaurantIssue.upsert({
    where: { webSlug: WEB_SLUG },
    update: { spec: personalSpec, status: 'ready', editionId: edition.id, restaurantId: restaurant.id },
    create: {
      editionId: edition.id,
      restaurantId: restaurant.id,
      webSlug: WEB_SLUG,
      spec: personalSpec,
      status: 'ready',
    },
  });

  console.log('✅ Реальный выпуск собран:');
  console.log(`   Ресторан : ${restaurant.name} (slug: ${restaurant.slug})`);
  console.log(`   Выпуск   : ${edition.title} (week ${edition.weekNumber})`);
  console.log(`   Читалка  : /magazine/r/${issue.webSlug}`);
  console.log(`   Печать   : /magazine/print/${issue.webSlug}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
