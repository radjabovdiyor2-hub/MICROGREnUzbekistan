// ════════════════════════════════════════════════════════════
// Дефолтные шаблоны выпуска — стартовый контент конструктора.
// Владелец правит слоты в админке; ИИ отдаёт тексты — их вставляют сюда.
// Контент перенесён из content/fresh_weekly_issue_01.html.
// ════════════════════════════════════════════════════════════
import type { Block, MagazineSpec } from './types';
import { mechanicForWeek } from './types';

// Общий 50% — одинаков для всех ресторанов недели
export function defaultSharedSpec(weekNumber = 1): MagazineSpec {
  const blocks: Block[] = [
    {
      // Склейка «здоровье + красота»: обе темы на одной полосе
      id: 'health', type: 'healthTrends', audience: 'all', origin: 'shared',
      title: { uz: 'Hafta salomatligi va go‘zalligi', ru: 'Здоровье и красота недели' },
      items: [
        {
          trendQuery: { uz: 'nega yuz terisi po‘st tashlaydi', ru: 'почему шелушится кожа на лице' },
          factTitle: { uz: 'Hafta fakti', ru: 'Факт недели' },
          fact: { uz: 'Quruq havo teri muammolarini keltirib chiqaradi.', ru: 'Сухой воздух — частая причина проблем с кожей.' },
          advice: { uz: 'Omega-3 va turp nihollari: C vitamini limondan ko‘p.', ru: 'Омега-3 и ростки редиса: витамина С больше, чем в лимоне.' },
        },
        {
          trendQuery: { uz: 'ko‘z ostidagi qorayishni qanday yo‘qotish', ru: 'как убрать синяки под глазами' },
          factTitle: { uz: 'Go‘zallik trendi', ru: 'Бьюти-тренд недели' },
          fact: { uz: 'Ko‘z ostidagi qorayish haqidagi so‘rovlar oshdi.', ru: 'Всплеск запросов о тёмных кругах под глазами.' },
          advice: { uz: 'K vitamini va temir: no‘xat va lavlagi mikrozeleni.', ru: 'Витамин K и железо: микрозелень гороха и свёклы.' },
        },
      ],
    },
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
    {
      // Склейка «лайфхаки + выпечка»: советы кухни одной полосой
      id: 'lifehacks', type: 'kitchenLifehacks', audience: 'women', origin: 'shared',
      title: { uz: 'Oshxona maslahatlari', ru: 'Советы кухни' },
      intro: { uz: 'Yangi boshlovchilar ham uddalaydi.', ru: 'Под силу даже новичку.' },
      items: [
        { title: { uz: 'Sarimsoq 5 soniyada', ru: 'Чеснок за 5 секунд' }, text: { uz: 'Tishchani pichoq yuzasi bilan bosing — po‘sti o‘zi chiqadi.', ru: 'Раздавите зубчик плоскостью ножа — шелуха отходит сама.' } },
        { title: { uz: 'Sho‘r bo‘lgan sho‘rva', ru: 'Пересолёный суп' }, text: { uz: 'Xom kartoshkani 10 daqiqaga soling — ortiqcha tuzni oladi.', ru: 'Опустите сырую картофелину на 10 минут — заберёт лишнюю соль.' } },
        { title: { uz: 'Matchali pechenye', ru: 'Печенье с матчей' }, text: { uz: 'Matcha va oq shokolad, duxovkada 15 daqiqa.', ru: 'Матча и белый шоколад, 15 минут в духовке.' } },
        { title: { uz: 'Rezavor tart', ru: 'Ягодный тарт' }, text: { uz: 'Qumli asos, krem-chiz va mavsumiy rezavorlar.', ru: 'Песочная основа, крем-чиз и сезонные ягоды.' } },
      ],
    },
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
    {
      id: 'kids', type: 'kids', audience: 'kids', origin: 'shared',
      mechanic: mechanicForWeek(weekNumber),
      title: 'Маленький шеф',
      instruction: 'Сделай мордочку зверя из еды: половинка яблока — лицо, микрозелень — волосы, изюм — глаза.',
      riddle: 'Зелёный, кудрявый, витаминами богатый — что это? (ответь голосом боту)',
      tale: 'Жил-был Росточек по имени … — вставьте нейро-сказку с именем ребёнка.',
    },
    {
      id: 'kids-catalog', type: 'kidsCatalog', audience: 'kids', origin: 'shared',
      title: 'Девять игр, где еда оживает',
      intro: 'Каждую неделю — новая механика. А все 9 доступны онлайн.',
    },
    {
      id: 'collection', type: 'collectionAR', audience: 'all', origin: 'shared',
      cardName: 'Кинза',
      cardText: 'Наведи камеру на карточку — персонаж оживёт в 3D.',
      arUrl: '/magazine/ar',
    },
  ];
  return { blocks };
}

// Персональный 50% — заполняется под конкретный ресторан
export function defaultPersonalSpec(restaurantName = 'Ресторан'): MagazineSpec {
  const blocks: Block[] = [
    {
      id: 'cover', type: 'cover', audience: 'all', origin: 'personal',
      title: 'Сладкое + острое:', accentTitle: 'новая эра вкуса',
      subtitle: 'Специальный выпуск для гостей',
      background: '',
      tags: ['Ресторан', 'Стрит-фуд', 'Рецепты', 'ЗОЖ'],
    },
    {
      id: 'toc', type: 'toc', audience: 'all', origin: 'personal',
      editorialNote: `Перед вами выпуск Fresh Weekly для гостей ${restaurantName}. Каждую неделю — новый рецепт, новый лайфхак и немного магии. Приятного чтения.`,
    },
    {
      id: 'chef', type: 'chefWord', audience: 'all', origin: 'personal',
      chefName: `Шеф-повар ${restaurantName}`,
      portrait: '',
      text: 'Вставьте приветственное слово от лица шефа/управляющего (текст генерирует ИИ по меню ресторана).',
    },
    {
      id: 'row', type: 'restaurantOfWeek', audience: 'all', origin: 'personal',
      name: restaurantName,
      heroImage: '',
      meta: 'Наш гость недели',
      pullQuote: 'Красивая тарелка — это бесплатная реклама в Instagram.',
      quoteAttr: `— Шеф-повар ${restaurantName}`,
      interview: [
        { q: 'Ваше фирменное блюдо?', a: 'Вставьте ответ шефа.' },
        { q: 'Совет для домашней кухни?', a: 'Вставьте ответ шефа.' },
      ],
      whatToOrder: 'Топ-3 блюда из меню',
      rating: 'Кухня ★★★★★ · Подача ★★★★★',
    },
    {
      id: 'family', type: 'familyConversion', audience: 'family', origin: 'personal',
      farmStory: 'Наша микрозелень растёт под Самаркандом и попадает на вашу тарелку в течение суток после срезки.',
      promoText: 'Понравилась наша зелень? Закажите домой со скидкой от ресторана.',
    },
  ];
  return { blocks };
}
