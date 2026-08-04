import { PrismaClient, Prisma } from '@prisma/client';

// ══════════════════════════════════════════════════════════════════════
// Засев справочника культур.
//
// Длительности фаз переносятся из CROP_DB — константы, которая жила во
// фронтенде (apps/web/src/components/admin/growingData.ts) и потому не
// правилась без выкладки кода.
//
// Расход семян на лоток — ориентировочный, по типовой агрономии для лотка
// 10×20". Это ЗАГОТОВКА, а не истина: реальный расход зависит от партии
// семян, всхожести и плотности посева, и владелец правит его в админке
// («Посадки» → «Нормы культур»). Именно по этим числам посадка списывает
// сырьё и считает себестоимость, поэтому уточнить их стоит по факту.
//
// Запуск (идемпотентно, существующие нормы НЕ перезаписываются):
//   npx tsx packages/database/prisma/seed-crop-norms.ts
// ══════════════════════════════════════════════════════════════════════

const prisma = new PrismaClient();

const NORMS: {
  cropType: string;
  nameRu: string;
  seedGramsPerTray: number;
  yieldPerTray: number;
  darkDays: number;
  lightDays: number;
  shelfDays: number;
}[] = [
  { cropType: 'radish',     nameRu: 'Редис',      seedGramsPerTray: 30, yieldPerTray: 350, darkDays: 3, lightDays: 4,  shelfDays: 7 },
  { cropType: 'broccoli',   nameRu: 'Брокколи',   seedGramsPerTray: 12, yieldPerTray: 250, darkDays: 3, lightDays: 6,  shelfDays: 7 },
  { cropType: 'sunflower',  nameRu: 'Подсолнух',  seedGramsPerTray: 90, yieldPerTray: 450, darkDays: 4, lightDays: 6,  shelfDays: 7 },
  { cropType: 'pea',        nameRu: 'Горошек',    seedGramsPerTray: 120, yieldPerTray: 500, darkDays: 4, lightDays: 8, shelfDays: 7 },
  { cropType: 'arugula',    nameRu: 'Руккола',    seedGramsPerTray: 12, yieldPerTray: 220, darkDays: 3, lightDays: 5,  shelfDays: 7 },
  { cropType: 'mustard',    nameRu: 'Горчица',    seedGramsPerTray: 12, yieldPerTray: 250, darkDays: 3, lightDays: 4,  shelfDays: 7 },
  { cropType: 'amaranth',   nameRu: 'Амарант',    seedGramsPerTray: 8,  yieldPerTray: 180, darkDays: 4, lightDays: 8,  shelfDays: 5 },
  { cropType: 'basil',      nameRu: 'Базилик',    seedGramsPerTray: 10, yieldPerTray: 180, darkDays: 4, lightDays: 10, shelfDays: 5 },
  { cropType: 'cilantro',   nameRu: 'Кинза',      seedGramsPerTray: 35, yieldPerTray: 250, darkDays: 5, lightDays: 10, shelfDays: 7 },
  { cropType: 'kohlrabi',   nameRu: 'Кольраби',   seedGramsPerTray: 12, yieldPerTray: 230, darkDays: 3, lightDays: 5,  shelfDays: 7 },
  { cropType: 'mizuna',     nameRu: 'Мизуна',     seedGramsPerTray: 12, yieldPerTray: 240, darkDays: 3, lightDays: 5,  shelfDays: 7 },
  { cropType: 'wheatgrass', nameRu: 'Витграсс',   seedGramsPerTray: 120, yieldPerTray: 400, darkDays: 3, lightDays: 6, shelfDays: 5 },
  { cropType: 'spinach',    nameRu: 'Шпинат',     seedGramsPerTray: 40, yieldPerTray: 220, darkDays: 3, lightDays: 8,  shelfDays: 5 },
  { cropType: 'beet',       nameRu: 'Свёкла',     seedGramsPerTray: 40, yieldPerTray: 250, darkDays: 4, lightDays: 8,  shelfDays: 5 },
  { cropType: 'cabbage',    nameRu: 'Капуста',    seedGramsPerTray: 12, yieldPerTray: 230, darkDays: 3, lightDays: 5,  shelfDays: 7 },
  { cropType: 'other',      nameRu: 'Другое',     seedGramsPerTray: 20, yieldPerTray: 250, darkDays: 3, lightDays: 6,  shelfDays: 5 },
];

async function main() {
  let created = 0;
  for (const norm of NORMS) {
    const existing = await prisma.cropNorm.findUnique({ where: { cropType: norm.cropType } });
    if (existing) continue; // уточнённые владельцем нормы не трогаем

    await prisma.cropNorm.create({
      data: {
        cropType: norm.cropType,
        nameRu: norm.nameRu,
        seedGramsPerTray: new Prisma.Decimal(norm.seedGramsPerTray),
        yieldPerTray: new Prisma.Decimal(norm.yieldPerTray),
        darkDays: norm.darkDays,
        lightDays: norm.lightDays,
        shelfDays: norm.shelfDays,
      },
    });
    created++;
  }
  console.log(`Нормы культур: добавлено ${created}, пропущено ${NORMS.length - created} (уже были).`);
  console.log('⚠️ Расход семян — ориентировочный. Уточните по факту в админке: Посадки → Нормы культур.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
