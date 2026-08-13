import { PrismaClient } from '@prisma/client';

// ══════════════════════════════════════════════════════════════════════
// Справочник категорий витрины — отдельно от каталога и ВСЕГДА.
//
// Раньше категории заводил только `seed.ts`, а он на деплое запускается лишь
// при пустом каталоге (`seed-if-empty.ts`). На рабочем проде каталог не пуст,
// поэтому новая категория не появлялась никогда — а `import-catalog.ts` на
// неизвестной категории падает с «Нет категории «X» — сначала прогоните
// seed.ts» и роняет весь шаг засева деплоя (exit 1).
//
// Тот же приём, что уже применён к нормам культур и сырью: идемпотентный
// сидер, безопасный на каждом запуске. `update: {}` — намеренно: имена и
// порядок владелец правит в админке, и переписывать их деплоем нельзя.
// ══════════════════════════════════════════════════════════════════════

export const CATEGORY_SEEDS = [
  { slug: 'microgreens', nameUz: "Mikroko'katlar", nameRu: 'Микрозелень', icon: 'Leaf', order: 1 },
  { slug: 'baby-leaf', nameUz: 'Baby Leaf', nameRu: 'Бейби лист', icon: 'Leaf', order: 2 },
  { slug: 'salads', nameUz: 'Salatlar', nameRu: 'Салаты', icon: 'Leaf', order: 3 },
  // BALANS — готовые миксы 100 г и киты с заправкой. Отдельная категория, а не
  // подраздел микрозелени: другая единица (упаковка, а не лоток), другой повод
  // покупки и своя страница метода `/balans`.
  { slug: 'balans', nameUz: 'BALANS', nameRu: 'BALANS', icon: 'Salad', order: 4 },
  { slug: 'flowers', nameUz: 'Gullar', nameRu: 'Цветы', icon: 'Sparkles', order: 5 },
  { slug: 'seeds', nameUz: "Urug'lar", nameRu: 'Семена', icon: 'Droplet', order: 6 },
  { slug: 'equipment', nameUz: 'Uskunalar', nameRu: 'Оборудование', icon: 'Settings', order: 7 },
  { slug: 'sets', nameUz: "To'plamlar", nameRu: 'Наборы', icon: 'Package', order: 8 },
  { slug: 'services', nameUz: 'Xizmatlar', nameRu: 'Услуги и Сервис', icon: 'Sparkles', order: 9 },
] as const;

/** Заводит недостающие категории и возвращает их по slug. */
export async function seedCategories(prisma: PrismaClient) {
  const bySlug: Record<string, { id: string }> = {};
  for (const cat of CATEGORY_SEEDS) {
    bySlug[cat.slug] = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: { ...cat },
    });
  }
  return bySlug;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const cats = await seedCategories(prisma);
    console.log(`Категории на месте: ${Object.keys(cats).length}.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
