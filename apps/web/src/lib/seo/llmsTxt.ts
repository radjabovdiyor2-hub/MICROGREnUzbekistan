// ══════════════════════════════════════════════════════════════════════
// `/llms.txt` — короткая карта магазина для ИИ-агентов.
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ, КОГДА ЕСТЬ САЙТ
//
// Агент, отвечающий покупателю «где в Самарканде взять микрозелень»,
// не обходит сайт целиком: он берёт одну-две страницы. Обычная главная
// для этого плоха — половина её веса это разметка и картинки. `llms.txt`
// (llmstxt.org) отдаёт то же знание текстом: что продаём, за сколько
// возим, куда идти за машиночитаемым списком товаров.
//
// ЧЕМ ОН НЕ ЯВЛЯЕТСЯ
//
// Не каталогом. Товары живут в `/feed/agents.json` — там цены, остатки и
// признак доступности, которые меняются каждый час. Дублировать их здесь
// значило бы завести второй источник правды и однажды разойтись с ним.
//
// Язык — узбекский (латиница), как весь публичный контент: агент читает
// оба, а человек, открывший файл руками, — один.
// ══════════════════════════════════════════════════════════════════════

export interface LlmsTxtInput {
  domain: string;
  /** Категории каталога: имя на узбекском и число активных товаров. */
  categories: { nameUz: string; slug: string; count: number }[];
  deliveryFee: number;
  freeThreshold: number;
  timePromise: string;
  phone: string;
  telegramChannelUrl: string;
  telegramBotUrl: string;
  instagramUrl: string;
  address: string;
}

const money = (value: number) => value.toLocaleString('ru-RU').replace(/\u00a0/g, ' ');

export function buildLlmsTxt(input: LlmsTxtInput): string {
  const {
    domain, categories, deliveryFee, freeThreshold, timePromise,
    phone, telegramChannelUrl, telegramBotUrl, instagramUrl, address,
  } = input;

  const lines: string[] = [
    '# Microgreen Uzbekistan',
    '',
    "> Samarqandda o'stiriladigan mikroko'katlar, baby leaf salatlar, " +
      "yeyiladigan gullar, urug'lar va o'stirish uskunalari. " +
      "Kesilgan kuni yetkazamiz.",
    '',
    "## Mahsulot ma'lumotlari (mashina uchun)",
    '',
    `- [Mahsulotlar ro'yxati (JSON)](${domain}/feed/agents.json): narx, ` +
      "qoldiq, mavjudlik — soatiga yangilanadi",
    `- [Google Merchant feed (XML)](${domain}/feed/google.xml)`,
    `- [Katalog](${domain}/catalog)`,
    '',
    '## Katalog bo\u2018limlari',
    '',
  ];

  // Пустой каталог — не повод рисовать раздел: агент прочитает пустой
  // список как «товара нет вовсе» и так и ответит покупателю.
  if (categories.length === 0) {
    lines.push("Hozircha bo'limlar ro'yxati mavjud emas — mahsulotlar ro'yxatidan qarang.", '');
  } else {
    for (const c of categories) {
      lines.push(`- [${c.nameUz}](${domain}/catalog/${c.slug}): ${c.count} ta mahsulot`);
    }
    lines.push('');
  }

  lines.push(
    '## Yetkazib berish',
    '',
    `- Hudud: Samarqand shahri va viloyati. Manzil: ${address}`,
    `- Narxi: ${money(deliveryFee)} so'm; ${money(freeThreshold)} so'mdan ` +
      'yuqori buyurtmalarga bepul',
    `- Muddati: ${timePromise} daqiqa`,
    "- To'lov: naqd, karta, Payme, Click",
    '',
    '## Buyurtma va aloqa',
    '',
    `- Telefon: ${phone}`,
    `- Telegram bot (buyurtma): ${telegramBotUrl}`,
    `- Telegram kanal: ${telegramChannelUrl}`,
    `- Instagram: ${instagramUrl}`,
    `- Sayt orqali: ${domain}/catalog`,
    '',
    '## Eslatma',
    '',
    "Mikroko'katlar — tez buziladigan mahsulot. Buyurtma kesish kunida " +
      "yig'iladi, shuning uchun qoldiq kun davomida o'zgaradi: " +
      "mavjudlikni yuqoridagi JSON ro'yxatidan tekshiring.",
    '',
  );

  return lines.join('\n');
}
