// ════════════════════════════════════════════════════════════
// Дефолтные шаблоны выпуска — стартовый контент конструктора.
// Владелец правит слоты в админке; ИИ отдаёт тексты — их вставляют сюда.
// Контент перенесён из content/fresh_weekly_issue_01.html.
// ════════════════════════════════════════════════════════════
import type { Block, MagazineSpec } from './types';

// Общий 50% — одинаков для всех ресторанов недели.
// weekNumber остаётся в сигнатуре: им пользуются вызывающие кроны и админка,
// а контент недели подставляется поверх дефолта.
export function defaultSharedSpec(_weekNumber = 1): MagazineSpec {
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
        {
          // Метод BALANS — порядок подачи, а не свойство продукта. Формулировки
          // держим на этом уровне: заявления о влиянии на здоровье требуют
          // разрешения Минздрава, и в журнал их писать нельзя.
          trendQuery: { uz: 'palovdan keyin og‘irlik', ru: 'тяжесть после плова' },
          factTitle: { uz: 'Stol odati', ru: 'Привычка за столом' },
          fact: { uz: 'Yaponiyada ko‘katni asosiy taomdan oldin berish odat.', ru: 'В Японии зелень принято подавать до основного блюда.' },
          advice: { uz: 'BALANS usuli: 100 g miks — palovdan 10-15 daqiqa oldin.', ru: 'Метод BALANS: 100 г микса — за 10–15 минут до плова.' },
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
