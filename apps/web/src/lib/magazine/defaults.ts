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
      id: 'news', type: 'newsDigest', audience: 'men', origin: 'shared',
      title: 'Неделя в цифрах',
      items: [
        { title: 'Вставьте новость', text: 'Быстрая выжимка главного события недели (спорт, бизнес, авто).' },
        { title: 'Ещё одна', text: 'ИИ отдаёт 2–4 короткие новости — вставьте их здесь.' },
      ],
    },
    {
      id: 'health', type: 'healthTrends', audience: 'men', origin: 'shared',
      trendQuery: 'почему шелушится кожа на лице',
      factTitle: 'Факт недели',
      fact: 'Участились проблемы с кожей из-за сухого воздуха.',
      advice: 'Решение — Омега-3 и ростки редиса: в них витамина С больше, чем в лимоне.',
    },
    {
      id: 'fitness', type: 'fitness', audience: 'men', origin: 'shared',
      title: '10 минут утром, которые меняют весь день',
      intro: 'Короткая утренняя зарядка без инвентаря.',
      exercises: [
        { name: 'Планка', text: '3 подхода по 30 секунд.' },
        { name: 'Приседания', text: '2 подхода по 15 повторений.' },
      ],
    },
    {
      id: 'recipe', type: 'recipe', audience: 'women', origin: 'shared',
      title: 'Чизкейк «Цветочный сад»',
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
      id: 'lifehacks', type: 'kitchenLifehacks', audience: 'women', origin: 'shared',
      title: 'Кухонные лайфхаки со всего мира',
      items: [
        { title: 'Чеснок за 5 секунд', text: 'Раздавите зубчик плоскостью ножа — шелуха отходит сама.' },
        { title: 'Пересолёный суп', text: 'Опустите сырую картофелину на 10 минут — заберёт лишнюю соль.' },
      ],
    },
    {
      id: 'baking', type: 'bakingDesserts', audience: 'women', origin: 'shared',
      title: 'Выпечка и десерты на выходные',
      intro: 'Рецепт, который под силу даже новичку.',
      items: [
        { title: 'Мягкое печенье с матчей', text: 'Матча + белый шоколад + микрозелень мяты для украшения. 15 минут в духовке.' },
        { title: 'Ягодный тарт', text: 'Песочная основа + крем-чиз + сезонные ягоды + съедобные цветы сверху.' },
      ],
    },
    {
      id: 'beauty', type: 'beautyTrends', audience: 'women', origin: 'shared',
      trendQuery: 'как убрать синяки под глазами',
      factTitle: 'Бьюти-тренд недели',
      fact: 'Всплеск запросов о тёмных кругах под глазами.',
      advice: 'Витамин K и железо: добавьте микрозелень гороха и свёклы в утренний смузи.',
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
      id: 'tech', type: 'techDigest', audience: 'all', origin: 'shared',
      title: 'Технологии, которые меняют еду и здоровье',
      entries: [
        { icon: '🌍', kicker: 'Стартап мира', name: 'Zoe · UK', text: 'Персонализированное питание на основе анализа крови. AI-рекомендации.' },
        { icon: '🇺🇿', kicker: 'Стартап Узбекистана', name: 'Zira.uz', text: '5000+ рецептов с пошаговыми фото и доставкой продуктов в один клик.' },
        { icon: '⌚', kicker: 'Гаджет', name: 'Mi Band 9', text: 'Лучший фитнес-трекер до $40. Батарея 16 дней.' },
      ],
      aiHack: 'Напишите ИИ: «В холодильнике курица, помидоры, лук, рис — предложи 3 блюда за 20 минут».',
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
      tags: ['Ресторан', 'Стрит-фуд', 'Рецепты', 'ЗОЖ'],
    },
    {
      id: 'toc', type: 'toc', audience: 'all', origin: 'personal',
      editorialNote: `Перед вами выпуск Fresh Weekly для гостей ${restaurantName}. Каждую неделю — новый рецепт, новый лайфхак и немного магии. Приятного чтения.`,
    },
    {
      id: 'chef', type: 'chefWord', audience: 'all', origin: 'personal',
      chefName: `Шеф-повар ${restaurantName}`,
      text: 'Вставьте приветственное слово от лица шефа/управляющего (текст генерирует ИИ по меню ресторана).',
    },
    {
      id: 'row', type: 'restaurantOfWeek', audience: 'all', origin: 'personal',
      name: restaurantName,
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
