import { PrismaClient, Prisma, RawMaterialKind } from '@prisma/client';

// ══════════════════════════════════════════════════════════════════════
// Засев СПРАВОЧНИКА сырья — позиций, а не остатков.
//
// 10.08.2026 Стёпан на вопрос о посадке ответил: «Запас семян кейла не был
// проверен, так как в наличии только семена гороха». Это была правда.
// Нормы культур засевались при каждом деплое, а сами позиции сырья — никогда
// и нигде: их заводили руками через админку, и завели ровно одну.
//
// Посадка ищет семена так (apps/web/src/lib/production/growBatch.ts):
//     rawMaterial.findFirst({ where: { kind: 'SEED', cropType, isActive } })
// Нет строки — нет посадки, нет себестоимости, нет партии.
//
// ОСТАТКИ ЗДЕСЬ НУЛЕВЫЕ, И ЭТО ГЛАВНОЕ.
//
// Справочник — это перечень того, ЧТО бывает на складе; сколько его лежит,
// знает только владелец. Выдуманный остаток хуже нулевого: по нему посадка
// спишет несуществующее сырьё, партия получит выдуманную себестоимость, а
// закупка не понадобится — до момента, когда семян физически не окажется.
// С нулём бот говорит по делу: «нужно 12 г семян кейла, на складе 0 —
// оформите приход».
//
// Количество вносится приходом: инструмент `receive_material` у Стёпана или
// «Производство → Сырьё → Приход» в админке. Приход же считает
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
 * Именно ради этой пары в норме культуры есть `substrateMaterialId` — без
 * явной привязки посадка брала «первый активный субстрат» и списывала бы
 * кокос под салат.
 *
 * Стаканчиков 63 мм здесь НЕТ намеренно: по решению владельца они
 * многоразовые, то есть не расходник и в себестоимость партии не входят.
 */
const CONSUMABLES: {
  key: string;
  name: string;
  kind: RawMaterialKind;
  unit: string;
  note: string;
}[] = [
  {
    key: 'coco',
    name: 'Кокосовый субстрат',
    kind: 'SUBSTRATE',
    unit: 'g',
    note: 'Стандарт микрозелени: 150 г на лоток.',
  },
  {
    key: 'wool',
    name: 'Агро вата (пробки 63 мм)',
    kind: 'SUBSTRATE',
    unit: 'pcs',
    note: 'Салаты в стаканчиках: одна пробка на стаканчик.',
  },
  {
    key: 'tray',
    name: 'Лоток 10×20',
    kind: 'TRAY',
    unit: 'pcs',
    note: 'Одноразовый, списывается при посадке лотками.',
  },
  {
    key: 'pack',
    name: 'Упаковка (контейнер)',
    kind: 'PACKAGING',
    unit: 'pcs',
    note: 'Списывается при СБОРЕ урожая, а не при посадке.',
  },
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
  const byKey = new Map<string, string>();
  let createdConsumables = 0;
  for (const item of CONSUMABLES) {
    const { row, created } = await ensure(item.name, item.kind, item.unit, item.note, null);
    byKey.set(item.key, row.id);
    if (created) createdConsumables++;
  }

  // ── Семена: по позиции на каждую культуру из норм ──
  //
  // Источник списка — сама таблица норм, а не второй список в этом файле:
  // две копии ассортимента разойдутся, и разойдутся молча — ровно так кейл
  // и оказался в прайсе, но не на складе.
  const norms = await prisma.cropNorm.findMany({ orderBy: { cropType: 'asc' } });
  let createdSeeds = 0;
  for (const norm of norms) {
    if (norm.cropType === 'other') continue; // «Другое» — не культура, семян у неё нет
    const { created } = await ensure(
      `Семена: ${norm.nameRu}`,
      'SEED',
      norm.seedUnit, // граммы для лотков, штуки для стаканчиков
      'Заведено справочником. Остаток вносится приходом.',
      norm.cropType,
    );
    if (created) createdSeeds++;
  }

  // ── Привязка субстрата к нормам ──
  //
  // Заполняем только пустое: выбор владельца не перезаписываем. Без привязки
  // посадка при двух субстратах отказывается работать (и правильно делает) —
  // угадывать между кокосом и ватой она не имеет права.
  const coco = byKey.get('coco');
  const wool = byKey.get('wool');
  const boundTrays = coco
    ? await prisma.cropNorm.updateMany({
        where: { substrateMaterialId: null, plantingUnit: 'tray' },
        data: { substrateMaterialId: coco },
      })
    : { count: 0 };
  const boundCups = wool
    ? await prisma.cropNorm.updateMany({
        where: { substrateMaterialId: null, plantingUnit: 'cup' },
        data: { substrateMaterialId: wool },
      })
    : { count: 0 };

  console.log(`Расходники: добавлено ${createdConsumables} из ${CONSUMABLES.length}.`);
  console.log(`Семена: добавлено ${createdSeeds} позиций (культур в нормах: ${norms.length}).`);
  console.log(`Субстрат привязан: лотки → кокос ${boundTrays.count}, стаканчики → вата ${boundCups.count}.`);
  console.log('⚠️ Остатки нулевые — это справочник, а не инвентаризация.');
  console.log('⚠️ Внесите приход: «Производство → Сырьё» или инструмент receive_material.');
}

if (require.main === module) {
  main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}

export { CONSUMABLES };
