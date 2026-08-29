import { PrismaClient, Prisma, RawMaterialKind } from '@prisma/client';

// ══════════════════════════════════════════════════════════════════════
// Засев СПРАВОЧНИКА сырья — позиций, а не остатков.
//
// Позиции сырья не заводились нигде: их вносили руками через админку, и
// завели ровно одну. Закупки семян при этом нигде не числились, хотя деньги
// на них уходили.
//
// ОСТАТКИ ЗДЕСЬ НУЛЕВЫЕ, И ЭТО ГЛАВНОЕ.
//
// Справочник — это перечень того, ЧТО бывает на складе; сколько его лежит,
// знает только владелец. Выдуманный остаток хуже нулевого: закупка по нему
// не понадобится — до момента, когда семян физически не окажется. С нулём
// бот говорит по делу: «семян кейла на складе 0 — оформите приход».
//
// Количество вносится приходом: инструмент `receive_material` у Стёпана или
// «Товар и склад → Сырьё → Приход» в админке. Приход же считает
// средневзвешенную себестоимость, поэтому и цену тут выдумывать нельзя.
//
// Запуск (идемпотентно, существующие позиции НЕ трогаются):
//   npx tsx packages/database/prisma/seed-raw-materials.ts
// ══════════════════════════════════════════════════════════════════════

const prisma = new PrismaClient();

/**
 * Расходники, общие для всего производства.
 *
 * Субстрата ДВА, и они не взаимозаменяемы: кокос под лотки микрозелени
 * (150 г на лоток), агро вата под стаканчики салата (пробка на стаканчик).
 *
 * Стаканчиков 63 мм здесь НЕТ намеренно: по решению владельца они
 * многоразовые, то есть не расходник.
 */
const CONSUMABLES: {
  name: string;
  kind: RawMaterialKind;
  unit: string;
  note: string;
}[] = [
  {
    name: 'Кокосовый субстрат',
    kind: 'SUBSTRATE',
    unit: 'g',
    note: 'Стандарт микрозелени: 150 г на лоток.',
  },
  {
    name: 'Агро вата (пробки 63 мм)',
    kind: 'SUBSTRATE',
    unit: 'pcs',
    note: 'Салаты в стаканчиках: одна пробка на стаканчик.',
  },
  {
    name: 'Лоток 10×20',
    kind: 'TRAY',
    unit: 'pcs',
    note: 'Одноразовый лоток микрозелени.',
  },
  {
    name: 'Упаковка (контейнер)',
    kind: 'PACKAGING',
    unit: 'pcs',
    note: 'Контейнер под готовый товар.',
  },
];

/**
 * Ассортимент семян: по позиции на культуру.
 *
 * Список перенесён из справочника норм культур — сам справочник удалён
 * вместе с производственным разделом, а перечень нужен: иначе культура
 * снова окажется в прайсе и не окажется на складе, как это уже было.
 *
 * Единица — та, в которой семена ЗАКУПАЮТ: микрозелень граммами, салат
 * дражированными семенами поштучно.
 */
const SEED_CROPS: { cropType: string; nameRu: string; unit: string }[] = [
  { cropType: 'radish', nameRu: 'Редис', unit: 'g' },
  { cropType: 'broccoli', nameRu: 'Брокколи', unit: 'g' },
  { cropType: 'sunflower', nameRu: 'Подсолнух', unit: 'g' },
  { cropType: 'pea', nameRu: 'Горошек', unit: 'g' },
  { cropType: 'arugula', nameRu: 'Руккола', unit: 'g' },
  { cropType: 'mustard', nameRu: 'Горчица', unit: 'g' },
  { cropType: 'amaranth', nameRu: 'Амарант', unit: 'g' },
  { cropType: 'basil', nameRu: 'Базилик', unit: 'g' },
  { cropType: 'cilantro', nameRu: 'Кинза', unit: 'g' },
  { cropType: 'kohlrabi', nameRu: 'Кольраби', unit: 'g' },
  { cropType: 'mizuna', nameRu: 'Мизуна', unit: 'g' },
  { cropType: 'wheatgrass', nameRu: 'Витграсс', unit: 'g' },
  { cropType: 'spinach', nameRu: 'Шпинат', unit: 'g' },
  { cropType: 'beet', nameRu: 'Свёкла', unit: 'g' },
  { cropType: 'cabbage', nameRu: 'Капуста', unit: 'g' },
  { cropType: 'cress', nameRu: 'Кресс-салат', unit: 'g' },
  { cropType: 'pakchoy', nameRu: 'Пак-чой', unit: 'g' },
  { cropType: 'tatsoi', nameRu: 'Татсой', unit: 'g' },
  { cropType: 'chard', nameRu: 'Мангольд', unit: 'g' },
  { cropType: 'kale', nameRu: 'Кейл', unit: 'g' },
  { cropType: 'mint', nameRu: 'Мята', unit: 'g' },
  { cropType: 'sorrel', nameRu: 'Щавель', unit: 'g' },
  { cropType: 'lettuce-aveleda', nameRu: 'Салат Aveleda', unit: 'pcs' },
  { cropType: 'lettuce-iceberg', nameRu: 'Салат Айсберг', unit: 'pcs' },
  { cropType: 'lettuce-romano', nameRu: 'Салат Романо', unit: 'pcs' },
  { cropType: 'lettuce-lollo', nameRu: 'Салат Лоло Росса', unit: 'pcs' },
  { cropType: 'lettuce-radicio', nameRu: 'Салат Радичио', unit: 'pcs' },
  { cropType: 'lettuce-frise', nameRu: 'Салат Фризе', unit: 'pcs' },
];

async function ensure(
  name: string,
  kind: RawMaterialKind,
  unit: string,
  note: string,
  cropType: string | null,
) {
  // Ищем по имени: `name` не уникален в схеме, а заводить составной ключ
  // ради сидера незачем — совпадение имени и есть «эта позиция уже есть».
  const existing = await prisma.rawMaterial.findFirst({ where: { name } });
  if (existing) return { row: existing, created: false };

  const row = await prisma.rawMaterial.create({
    data: {
      name,
      kind,
      unit,
      cropType,
      stock: new Prisma.Decimal(0),
      avgCost: new Prisma.Decimal(0),
      note,
    },
  });
  return { row, created: true };
}

async function main() {
  // ── Расходники ──
  let createdConsumables = 0;
  for (const item of CONSUMABLES) {
    const { created } = await ensure(item.name, item.kind, item.unit, item.note, null);
    if (created) createdConsumables++;
  }

  // ── Семена: по позиции на каждую культуру ассортимента ──
  let createdSeeds = 0;
  for (const crop of SEED_CROPS) {
    const { created } = await ensure(
      `Семена: ${crop.nameRu}`,
      'SEED',
      crop.unit, // граммы у микрозелени, штуки у дражированного салата
      'Заведено справочником. Остаток вносится приходом.',
      crop.cropType,
    );
    if (created) createdSeeds++;
  }

  console.log(`Расходники: добавлено ${createdConsumables} из ${CONSUMABLES.length}.`);
  console.log(`Семена: добавлено ${createdSeeds} позиций из ${SEED_CROPS.length}.`);
  console.log('⚠️ Остатки нулевые — это справочник, а не инвентаризация.');
  console.log('⚠️ Внесите приход: «Товар и склад → Сырьё» или инструмент receive_material.');
}

if (require.main === module) {
  main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}

export { CONSUMABLES };
