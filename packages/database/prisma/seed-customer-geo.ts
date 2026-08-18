import { PrismaClient } from '@prisma/client';

// ══════════════════════════════════════════════════════════════════════
// DEV-ONLY: расставляет клиентов по карте, чтобы её можно было увидеть.
//
// На старте координат в базе нет ни у кого, и разрабатывать карту вслепую
// нельзя: не видно ни кластеров, ни раскраски, ни легенды. Скрипт даёт
// правдоподобную картинку — точки по Ташкенту и Самарканду с разбросом.
//
// Два обязательных свойства, без которых скрипт опасен:
//
//  1. Ставит geo_source='seed', а НЕ 'manual'. Настоящий геокодер и ручная
//     простановка такие точки спокойно перезапишут, и инвариант «manual не
//     трогать» остаётся целым.
//  2. Отказывается работать против продовой базы. Иначе однажды живые
//     рестораны окажутся раскиданы по случайным адресам — самая дорогая
//     ошибка, какую эта фича вообще может допустить.
//
// Запуск:  npx tsx prisma/seed-customer-geo.ts
// Откат:   npx tsx prisma/seed-customer-geo.ts --clear
// ══════════════════════════════════════════════════════════════════════

const prisma = new PrismaClient();

/** Центры городов и разброс в градусах (~0.06° ≈ 6 км). */
const CITY_POINTS: Record<string, { lat: number; lon: number; spread: number; districts: string[] }> = {
  tashkent: {
    lat: 41.3111,
    lon: 69.2401,
    spread: 0.07,
    districts: ['chilanzar', 'yunusobod', 'mirobod', 'yakkasaroy', 'shayxontohur', 'olmazor'],
  },
  samarkand: {
    lat: 39.6542,
    lon: 66.9597,
    spread: 0.04,
    districts: ['siyob', 'temiryol'],
  },
};

/** Написания городов из базы → ключ CITY_POINTS. */
function cityKey(raw: string): keyof typeof CITY_POINTS {
  const s = raw.toLowerCase();
  if (s.includes('tash') || s.includes('тош') || s.includes('таш')) return 'tashkent';
  return 'samarkand';
}

/**
 * Детерминированный PRNG с сидом от id клиента: повторный прогон ставит те
 * же точки. Иначе каждый запуск перетасовывал бы карту, и отличить «данные
 * изменились» от «сидер пробежал ещё раз» было бы невозможно.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function assertNotProduction(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Отказ: NODE_ENV=production. Этот скрипт только для разработки.');
  }
  const url = process.env.DATABASE_URL ?? '';
  const local = /localhost|127\.0\.0\.1|@postgres[:/]|@db[:/]/.test(url);
  if (!local) {
    throw new Error(
      'Отказ: DATABASE_URL не похож на локальную базу. ' +
        'Запускайте только против localhost или docker-контейнера.',
    );
  }
}

async function clear(): Promise<void> {
  const { count } = await prisma.customer.updateMany({
    where: { geoSource: 'seed' },
    data: { latitude: null, longitude: null, geoSource: null, geoPrecision: null, district: null },
  });
  console.log(`Снято тестовых точек: ${count}`);
}

async function main(): Promise<void> {
  assertNotProduction();

  if (process.argv.includes('--clear')) {
    await clear();
    return;
  }

  // Ручные пины не трогаем никогда — это правило важнее удобства сидера.
  const customers = await prisma.customer.findMany({
    where: { latitude: null, geoSource: { not: 'manual' } },
    select: { id: true, city: true },
  });

  if (customers.length === 0) {
    console.log('Клиентов без координат нет — ставить нечего.');
    return;
  }

  let placed = 0;
  for (const c of customers) {
    const rand = mulberry32(c.id * 2654435761);
    const key = cityKey(c.city);
    const base = CITY_POINTS[key];

    // Смещение по обеим осям в пределах разброса, ±spread от центра.
    const lat = base.lat + (rand() - 0.5) * 2 * base.spread;
    const lon = base.lon + (rand() - 0.5) * 2 * base.spread;
    const district = base.districts[Math.floor(rand() * base.districts.length)];

    await prisma.customer.update({
      where: { id: c.id },
      data: {
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lon.toFixed(6)),
        geoSource: 'seed',
        geoPrecision: 'street',
        geocodedAt: new Date(),
        district,
      },
    });
    placed += 1;
  }

  console.log(`Расставлено тестовых точек: ${placed}`);
  console.log('Снять: npx tsx prisma/seed-customer-geo.ts --clear');
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
