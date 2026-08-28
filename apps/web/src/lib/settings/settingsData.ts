import { DELIVERY, CONTACT } from '@/lib/site';
import type { SettingDef } from './settingsDefinitions';

export const SETTINGS = {
  // ── Доставка ────────────────────────────────────────────────────────
  'delivery.fee': {
    category: 'delivery', type: 'money', default: DELIVERY.fee, publicKey: true,
    labelRu: 'Стоимость доставки', labelUz: 'Yetkazib berish narxi',
    hintRu: 'Плоский тариф ниже порога бесплатной доставки', min: 0,
  },
  'delivery.freeThreshold': {
    category: 'delivery', type: 'money', default: DELIVERY.freeThreshold, publicKey: true,
    labelRu: 'Бесплатно от суммы', labelUz: 'Bepul yetkazish summasi',
    hintRu: 'Заказ на эту сумму и выше — доставка бесплатна', min: 0,
  },
  'delivery.timePromise': {
    category: 'delivery', type: 'string', default: '30-90', publicKey: true,
    labelRu: 'Обещанное время (мин)', labelUz: 'Yetkazish vaqti (daq)',
    hintRu: 'Показывается на сайте и в карточке товара',
  },

  // ── Контакты ────────────────────────────────────────────────────────
  'contacts.phonePrimary': {
    category: 'contacts', type: 'string', default: CONTACT.phonePrimary, publicKey: true,
    labelRu: 'Основной телефон', labelUz: 'Asosiy telefon',
    hintRu: 'Используется на сайте, в боте и в промптах ИИ',
  },
  'contacts.phoneSecondary': {
    category: 'contacts', type: 'string', default: CONTACT.phoneSecondary, publicKey: true,
    labelRu: 'Второй телефон', labelUz: 'Ikkinchi telefon',
  },
  'contacts.email': {
    category: 'contacts', type: 'string', default: 'hello@microgreenuzbekistan.com', publicKey: true,
    labelRu: 'E-mail', labelUz: 'E-mail',
  },
  'contacts.address': {
    category: 'contacts', type: 'string', default: 'Samarqand, Ray Center', publicKey: true,
    labelRu: 'Адрес магазина', labelUz: "Do'kon manzili",
  },
  'contacts.instagramUrl': {
    category: 'contacts', type: 'string', default: CONTACT.instagramUrl, publicKey: true,
    labelRu: 'Instagram', labelUz: 'Instagram',
  },
  'contacts.telegramChannelUrl': {
    category: 'contacts', type: 'string', default: CONTACT.telegramChannelUrl, publicKey: true,
    labelRu: 'Telegram-канал', labelUz: 'Telegram kanal',
  },
  'contacts.telegramBotUrl': {
    category: 'contacts', type: 'string', default: CONTACT.telegramBotUrl, publicKey: true,
    labelRu: 'Telegram-бот', labelUz: 'Telegram bot',
  },
  'contacts.whatsappUrl': {
    category: 'contacts', type: 'string', default: CONTACT.whatsappUrl, publicKey: true,
    labelRu: 'WhatsApp', labelUz: 'WhatsApp',
  },

  // ── Тексты на сайте ─────────────────────────────────────────────────
  'content.heroTitle': {
    category: 'content', type: 'string', default: 'Microgreen Uzbekistan', publicKey: true,
    labelRu: 'Заголовок на главной', labelUz: 'Bosh sahifa sarlavhasi',
  },
  'content.heroSubtitle': {
    category: 'content', type: 'string', default: 'Mikrozelen • Gidroponika • Sog‘lom hayot', publicKey: true,
    labelRu: 'Подзаголовок', labelUz: 'Kichik sarlavha',
  },
  'content.bannerEnabled': {
    category: 'content', type: 'boolean', default: false, publicKey: true,
    labelRu: 'Показывать баннер', labelUz: "Bannerni ko'rsatish",
    hintRu: 'Полоса-объявление вверху сайта и в боте',
  },
  'content.bannerText': {
    category: 'content', type: 'text', default: '', publicKey: true,
    labelRu: 'Текст баннера', labelUz: 'Banner matni',
  },
  'content.workHoursWeekday': {
    category: 'content', type: 'string', default: 'Пн–Сб 08:00–20:00', publicKey: true,
    labelRu: 'Часы работы (будни)', labelUz: 'Ish vaqti (dushanba-shanba)',
    hintRu: 'Только надпись на сайте: заказы принимаются круглосуточно',
  },
  'content.workHoursSunday': {
    category: 'content', type: 'string', default: 'Вс 09:00–18:00', publicKey: true,
    labelRu: 'Часы работы (воскресенье)', labelUz: 'Ish vaqti (yakshanba)',
  },

  // ── Бонусы и рефералы ───────────────────────────────────────────────
  'bonus.referralPercent': {
    category: 'bonus', type: 'number', default: 3,
    labelRu: 'Процент с заказа реферала', labelUz: 'Referal buyurtmasidan foiz',
    hintRu: 'Сколько % от заказа получает пригласивший', min: 0, max: 100,
  },
  'bonus.referrerReward': {
    category: 'bonus', type: 'money', default: 5000,
    labelRu: 'Бонус пригласившему', labelUz: 'Taklif qilganga bonus', min: 0,
  },
  'bonus.newUserReward': {
    category: 'bonus', type: 'money', default: 2000,
    labelRu: 'Бонус новому клиенту', labelUz: 'Yangi mijozga bonus', min: 0,
  },
  'bonus.minCashout': {
    category: 'bonus', type: 'money', default: 50000,
    labelRu: 'Минимум для списания бонусов', labelUz: 'Minimal yechish summasi',
    hintRu: 'Раньше значение показывали клиенту, но НЕ проверяли при заказе', min: 0,
  },

  // ── Лояльность HoReCa — УБРАНО ──────────────────────────────────────
  // Здесь были loyalty.goal, loyalty.rewardPercent и loyalty.rewardValidDays.
  // Проверка перебором всех ключей показала: ни один из них не встречался в
  // коде ни разу за пределами этого файла. Владелец их правил, а поведение
  // не менялось — настройка, которая врёт, хуже отсутствующей.
  // Вернуть их следует вместе с реализацией лояльности, а не раньше.

  // ── Склад ───────────────────────────────────────────────────────────
  'stock.criticalLevel': {
    category: 'stock', type: 'number', default: 2,
    labelRu: 'Критический остаток', labelUz: 'Kritik qoldiq',
    hintRu: 'Ниже или равно — статус CRITICAL и красный флаг в отчётах', min: 0,
  },
  'stock.lowStockAlert': {
    category: 'stock', type: 'number', default: 5,
    labelRu: 'Порог уведомления в Telegram', labelUz: 'Telegram ogohlantirish chegarasi', min: 0,
  },
  'stock.lowDaysOfSupply': {
    category: 'stock', type: 'number', default: 14,
    labelRu: 'Мало запаса (дней продаж)', labelUz: 'Kam zaxira (kun)', min: 1,
  },
  'stock.excessMultiplier': {
    category: 'stock', type: 'number', default: 3,
    labelRu: 'Избыток: месячных продаж ×', labelUz: 'Ortiqcha: oylik sotuv ×', min: 1,
  },
  // ── Коридоры нормы ────────────────────────────────────────────────
  //
  // Само число ничего не говорит, пока не задана граница «всё хорошо» и
  // «пора реагировать». Отчёты показывали выход с лотка и долю брака, но
  // выход этих величин за разумные пределы никто не подсвечивал — заметить
  // его можно было, только сравнив две сводки глазами.
  //
  // Значения по умолчанию намеренно мягкие: сигнал, срабатывающий каждый
  // день, перестают читать через неделю.
  'kpi.defectSharePct': {
    category: 'stock', type: 'number', default: 15,
    labelRu: 'Доля брака, тревога от %', labelUz: 'Brak ulushi, ogohlantirish %',
    hintRu: 'Выше этой доли списаний за неделю — сигнал владельцу', min: 1, max: 100,
  },
  'kpi.minActiveCustomers': {
    category: 'stock', type: 'number', default: 5,
    labelRu: 'Активных заведений, тревога ниже', labelUz: 'Faol mijozlar, ogohlantirish',
    hintRu: 'Меньше этого числа покупавших за месяц — сигнал', min: 0,
  },
  // Правило из разбора: не более трети выручки от одного клиента. Одно
  // заведение, дающее половину оборота, — риск, о котором узнают поздно.
  'kpi.maxClientSharePct': {
    category: 'stock', type: 'number', default: 33,
    labelRu: 'Доля одного клиента, тревога от %', labelUz: 'Bitta mijoz ulushi, ogohlantirish %',
    hintRu: 'Выше этой доли выручки от одного заведения — сигнал', min: 10, max: 100,
  },
  // Себестоимость выезда: без неё дальняя точка с мелким заказом выглядит
  // прибыльной, потому что дорога в расчёт не входит.
  'delivery.tripCost': {
    category: 'delivery', type: 'money', default: 0,
    labelRu: 'Себестоимость одного выезда', labelUz: 'Bitta chiqishning tannarxi',
    hintRu: 'Топливо и время. Ноль — доставка в рентабельность канала не войдёт', min: 0,
  },
  'stock.reorderLeadDays': {
    category: 'stock', type: 'number', default: 14,
    labelRu: 'Точка дозаказа (дней)', labelUz: 'Qayta buyurtma (kun)',
    hintRu: 'Срок поставки + страховой запас', min: 1,
  },
  'stock.demandWindowDays': {
    category: 'stock', type: 'number', default: 90,
    labelRu: 'Окно расчёта спроса (дней)', labelUz: 'Talab oynasi (kun)', min: 7,
  },

  // ── Оплата ──────────────────────────────────────────────────────────
  // Click и Payme здесь стояли по умолчанию, и оформление честно рисовало
  // обе кнопки — а платёжной ссылки не создаёт никто: клиент выбирал способ,
  // видел «Заказ принят» и оставался должен наличными. Обещание вернётся
  // вместе с рабочими merchant-контрактами, не раньше; словарь `allowed`
  // держит эту дверь закрытой и от правки в админке.
  'payment.methods': {
    category: 'payment', type: 'list', default: ['cash', 'card', 'transfer'], publicKey: true,
    allowed: ['cash', 'card', 'transfer', 'contract'],
    labelRu: 'Способы оплаты', labelUz: "To'lov usullari",
    hintRu: 'Порядок влияет на порядок в корзине. Пустой список сломает оформление. Онлайн-оплаты нет: Click и Payme не подключены',
  },

  // ── ИИ ──────────────────────────────────────────────────────────────
  // Рубильник ИИ. Стоит ПЕРВЫМ в разделе намеренно: когда его ищут,
  // ищут срочно.
  //
  // Бюджеты ниже — это потолок расхода, а не выключатель: они
  // останавливают ИИ, когда деньги УЖЕ потрачены. Здесь наоборот —
  // тишина по решению владельца, до трат.
  //
  // Почему это вообще понадобилось: каждый выкат перезапускает двенадцать
  // ботов, а интервальные задачи стартуют через полминуты после запуска.
  // Пять выкатов за день — пять кругов вызовов на ровном месте.
  //
  // Значение читают ОБЕ стороны из одной таблицы app_settings: витрина
  // напрямую, боты через shared/settings_store с кэшем в минуту. Поэтому
  // выключение доезжает до ботов за минуту БЕЗ перезапуска контейнеров —
  // иначе выключатель сам стоил бы того круга вызовов, который гасит.
  'ai.enabled': {
    category: 'ai', type: 'boolean', default: true, publicKey: true,
    labelRu: 'ИИ включён', labelUz: 'AI yoqilgan',
    hintRu: 'Выключить — боты и витрина перестают обращаться к модели и честно об этом говорят. Доезжает за минуту, перезапуск не нужен.',
  },
  'ai.dailyBudgetUsd': {
    category: 'ai', type: 'number', default: 5,
    labelRu: 'Дневной бюджет ИИ ($)', labelUz: 'Kunlik AI byudjeti ($)', min: 0,
  },
  'ai.monthlyBudgetUsd': {
    category: 'ai', type: 'number', default: 100,
    labelRu: 'Месячный бюджет ИИ ($)', labelUz: 'Oylik AI byudjeti ($)', min: 0,
  },
  'ai.usdUzsRate': {
    category: 'ai', type: 'number', default: 12600,
    labelRu: 'Курс USD → UZS', labelUz: 'USD → UZS kursi',
    hintRu: 'Для пересчёта расходов на ИИ в P&L', min: 1,
  },

  // ── Журнал ──────────────────────────────────────────────────────────
  // magazine.printUnitCost убрана по той же причине: её никто не читал.
  //
  // А вот цена печатного выпуска читается: /api/config отдаёт её витринному
  // боту, и тот называет её в двух местах — в кнопке «Заказать печатную
  // копию» и в ответе на заявку. До этого 30 000 стояли в обоих местах
  // числом, и поднять цену можно было только правкой кода.
  'magazine.printPrice': {
    category: 'magazine', type: 'money', default: 30000, publicKey: true,
    labelRu: 'Цена печатного выпуска', labelUz: 'Bosma son narxi', min: 0,
    hintRu: 'Показывается в боте при заказе печатной версии (с доставкой по Самарканду)',
  },

  // ── Самостоятельность ботов ─────────────────────────────────────────
  // До этих порогов «рискованно» означало «спрашивать всегда», и под правило
  // попало ВСЁ, что делает настоящую работу. Списать два килограмма субстрата
  // стоило владельцу столько же внимания, сколько рассылка по всей базе, —
  // и без него офис только смотрел.
  //
  // Мелкое и обратимое бот делает сам и докладывает постфактум. Крупное —
  // по-прежнему через подтверждение. Ноль = спрашивать всегда, то есть
  // прежнее поведение.
  //
  // Рассылки, письма клиентам и публикации порогов НЕ имеют намеренно:
  // отправленное сообщение не отзывается.
  'autonomy.writeOffMax': {
    category: 'autonomy', type: 'number', default: 5,
    labelRu: 'Списание сырья без спроса, до', labelUz: "So'rovsiz hisobdan chiqarish",
    hintRu: 'Сколько единиц бот спишет сам (кг, шт). Больше — спросит. 0 — спрашивать всегда',
    min: 0,
  },
  'autonomy.plantTraysMax': {
    category: 'autonomy', type: 'number', default: 20,
    labelRu: 'Посадка без спроса, до (единиц)', labelUz: "So'rovsiz ekish (birlik)",
    // Единица зависит от культуры: лотки у микрозелени, стаканчики 63 мм
    // у салата. Порог один на обе — предикат порога в базу не ходит и узнать
    // единицу не может, а брать больший из двух значило бы тихо ослабить
    // лимит на лотки. Ставьте под свой обычный объём посадки.
    hintRu: 'Лотков у микрозелени или стаканчиков у салата. Посадка списывает семена и субстрат по норме. 0 — спрашивать всегда',
    min: 0,
  },
  'autonomy.receiptMaxSum': {
    category: 'autonomy', type: 'money', default: 1000000,
    labelRu: 'Приход сырья без спроса, до суммы', labelUz: "So'rovsiz qabul summasi",
    hintRu: 'Оприходование закупки на сумму меньше этой. 0 — спрашивать всегда',
    min: 0,
  },
  'autonomy.financeMaxSum': {
    category: 'autonomy', type: 'money', default: 500000,
    labelRu: 'Запись расхода без спроса, до суммы', labelUz: "So'rovsiz xarajat summasi",
    hintRu: 'Проводка в финансы на сумму меньше этой. 0 — спрашивать всегда',
    min: 0,
  },
} as const satisfies Record<string, SettingDef>;

export type SettingKey = keyof typeof SETTINGS;
