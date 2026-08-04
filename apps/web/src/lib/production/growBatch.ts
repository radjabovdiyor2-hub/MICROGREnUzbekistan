import { prisma, Prisma } from '@repo/database';
import { consumeMaterial, NotEnoughMaterialError } from './rawMaterials';
import { unitCostOfHarvest, weightedAverageCost } from './weightedAverage';

// ══════════════════════════════════════════════════════════════════════
// Посадка → урожай → товар на складе с реальной себестоимостью.
//
// ЧТО БЫЛО. Посадка была простым INSERT: сырьё не списывалось, себестоимость
// (`costPrice`) молча терялась при создании, а урожай приходовался ДВУМЯ
// несвязанными запросами из браузера — сначала движение склада, потом патч
// партии. Двойной клик давал двойной приход; сбой между запросами оставлял
// товар на складе при несобранной партии. «Просрочено N (убыток 0 сум)»
// показывал ноль всегда, потому что убыток считался из `costPrice`, которого
// в базе не было.
//
// ЧТО СТАЛО. Обе операции делает сервер, каждая — одной транзакцией:
//
//   посадка  = партия + списание сырья по норме + себестоимость партии
//   урожай   = факт + приход товара + себестоимость единицы + средняя цена
//
// Данных не хватает — отвечаем 409 со списком того, чего именно нет, чтобы
// форма и бот СПРОСИЛИ, а не провалились молча.
// ══════════════════════════════════════════════════════════════════════

const dec = (v: Prisma.Decimal | number | null | undefined): number =>
  v == null ? 0 : Number(v);

/** Не хватает справочных данных — вызывающий обязан спросить у человека. */
export class MissingDataError extends Error {
  constructor(readonly needs: string[], message: string) {
    super(message);
  }
}

export { NotEnoughMaterialError };

export interface PlantInput {
  cropType: string;
  trays: number;
  seedDate: string;
  note?: string | null;
  performedBy?: string | null;
  /** Чем именно сеем. Не указано — берём семена этой культуры со склада. */
  seedMaterialId?: string | null;
  productId?: string | null;
  productName?: string | null;
}

/** Что и сколько уйдёт со склада на такую посадку — до её создания. */
export async function plantingRequirements(cropType: string, trays: number) {
  const norm = await prisma.cropNorm.findUnique({ where: { cropType } });
  if (!norm) {
    throw new MissingDataError(
      ['cropNorm'],
      `Для культуры «${cropType}» не заданы нормы расхода. ` +
        `Укажите, сколько грамм семян уходит на один лоток — дальше посчитаю сам.`,
    );
  }

  const seedMaterial = await prisma.rawMaterial.findFirst({
    where: { kind: 'SEED', cropType, isActive: true },
    orderBy: { createdAt: 'asc' },
  });

  const needs: {
    material: { id: string; name: string; unit: string; stock: number; avgCost: number } | null;
    kind: string;
    required: number;
    label: string;
  }[] = [];

  needs.push({
    material: seedMaterial
      ? {
          id: seedMaterial.id,
          name: seedMaterial.name,
          unit: seedMaterial.unit,
          stock: dec(seedMaterial.stock),
          avgCost: dec(seedMaterial.avgCost),
        }
      : null,
    kind: 'SEED',
    required: dec(norm.seedGramsPerTray) * trays,
    label: 'Семена',
  });

  // Расходники — по решению владельца входят в себестоимость наравне с
  // семенами. Норма не задана → статья просто не участвует, а не срывает
  // посадку: субстрат могли ещё не начать учитывать.
  for (const [kind, perTray, label] of [
    ['SUBSTRATE', dec(norm.substrateGramsPerTray), 'Субстрат'],
    ['PACKAGING', dec(norm.packagingPerTray), 'Упаковка'],
  ] as const) {
    if (perTray <= 0) continue;
    const material = await prisma.rawMaterial.findFirst({
      where: { kind, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    needs.push({
      material: material
        ? {
            id: material.id,
            name: material.name,
            unit: material.unit,
            stock: dec(material.stock),
            avgCost: dec(material.avgCost),
          }
        : null,
      kind,
      required: perTray * trays,
      label,
    });
  }

  return { norm, needs };
}

/** Посадить партию: списать сырьё и зафиксировать себестоимость. */
export async function plantBatch(input: PlantInput) {
  const trays = Math.max(1, Math.floor(Number(input.trays) || 1));
  const seedDate = new Date(input.seedDate);
  if (Number.isNaN(seedDate.getTime())) throw new Error('Некорректная дата посева');

  const { norm, needs } = await plantingRequirements(input.cropType, trays);

  // Семена обязательны: без них посадки не существует. Нет карточки сырья —
  // это вопрос владельцу, а не повод записать посадку без себестоимости.
  const seed = needs.find((n) => n.kind === 'SEED')!;
  if (!seed.material) {
    throw new MissingDataError(
      ['seedMaterial'],
      `Семян «${norm.nameRu}» нет на складе сырья. Заведите их и укажите приход — ` +
        `тогда посадка спишет нужные ${seed.required} г и посчитает себестоимость.`,
    );
  }

  return prisma.$transaction(async (tx) => {
    const batch = await tx.growBatch.create({
      data: {
        cropType: input.cropType,
        trays,
        seedDate,
        darkDays: norm.darkDays,
        lightDays: norm.lightDays,
        shelfDays: norm.shelfDays,
        status: 'dark',
        note: input.note ? String(input.note).slice(0, 1000) : null,
        productId: input.productId || null,
        productName: input.productName || null,
        plannedYield: norm.yieldPerTray
          ? new Prisma.Decimal(dec(norm.yieldPerTray) * trays)
          : null,
      },
    });

    let seedCost = 0;
    let suppliesCost = 0;

    for (const need of needs) {
      if (!need.material || need.required <= 0) continue;
      const spent = await consumeMaterial(tx, {
        materialId: need.material.id,
        quantity: need.required,
        growBatchId: batch.id,
        reason: `Посадка ${norm.nameRu} — ${trays} лотков`,
        performedBy: input.performedBy,
      });
      if (need.kind === 'SEED') seedCost += spent.cost;
      else suppliesCost += spent.cost;
    }

    return tx.growBatch.update({
      where: { id: batch.id },
      data: {
        seedCost: new Prisma.Decimal(seedCost.toFixed(2)),
        suppliesCost: new Prisma.Decimal(suppliesCost.toFixed(2)),
      },
    });
  });
}

export interface HarvestInput {
  batchId: string;
  harvestQty: number;
  productId?: string | null;
  productName?: string | null;
  performedBy?: string | null;
}

/**
 * Собрать урожай: оприходовать товар с посчитанной себестоимостью.
 *
 * Идемпотентно: партия уже `harvested` — отказ. Раньше защиты не было, и
 * двойной клик по кнопке «Собрать» приходовал урожай дважды.
 */
export async function harvestBatch(input: HarvestInput) {
  const harvestQty = Number(input.harvestQty);
  if (!Number.isFinite(harvestQty) || harvestQty <= 0) {
    throw new Error('Некорректный объём урожая');
  }

  return prisma.$transaction(async (tx) => {
    const batch = await tx.growBatch.findUnique({ where: { id: input.batchId } });
    if (!batch) throw new Error('Партия не найдена');
    if (batch.status === 'harvested') {
      throw new AlreadyHarvestedError(batch.harvestQty ?? 0);
    }

    const batchCost = dec(batch.seedCost) + dec(batch.suppliesCost);
    const unitCost = unitCostOfHarvest(batchCost, harvestQty);
    const productId = input.productId || batch.productId;

    if (productId) {
      // Приход товара делает сервер, в той же транзакции, что и фиксация
      // урожая. Раньше это были два HTTP-запроса из браузера: если второй не
      // проходил, партия оставалась несобранной, а товар на складе уже был.
      await tx.product.update({
        where: { id: productId },
        data: { stock: { increment: Math.round(harvestQty) } },
      });
      await tx.stockMovement.create({
        data: {
          productId,
          type: 'IN',
          quantity: Math.round(harvestQty),
          reason: 'Урожай с посадки',
          note: `${batch.cropType}, ${batch.trays} лотков, посев ${batch.seedDate.toISOString().slice(0, 10)}`,
          costPrice: Math.round(unitCost),
          performedBy: input.performedBy || 'Посадки',
        },
      });

      // Себестоимость товара — тоже средневзвешенная, по той же формуле, что
      // у сырья: смешивать урожай разных партий по «последней цене» значило бы
      // считать маржу от случайной величины.
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { stock: true, costPrice: true },
      });
      if (product) {
        const stockBefore = Math.max(0, product.stock - Math.round(harvestQty));
        const blended = weightedAverageCost(
          stockBefore,
          product.costPrice ?? 0,
          harvestQty,
          unitCost,
        );
        await tx.product.update({
          where: { id: productId },
          data: { costPrice: Math.round(blended) },
        });
      }
    }

    return tx.growBatch.update({
      where: { id: batch.id },
      data: {
        harvestQty,
        harvestDate: new Date(),
        status: 'harvested',
        costPrice: unitCost,
        productId: productId || null,
        productName: input.productName || batch.productName,
      },
    });
  });
}

/** Партию уже собирали — повторный приход отклонён. */
export class AlreadyHarvestedError extends Error {
  constructor(readonly harvestQty: number) {
    super(`Партия уже собрана (${harvestQty}). Повторный приход на склад отклонён.`);
  }
}

/** Списать просроченную партию — с настоящим убытком, а не с нулём. */
export async function writeOffBatch(batchId: string, performedBy?: string | null) {
  return prisma.$transaction(async (tx) => {
    const batch = await tx.growBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new Error('Партия не найдена');
    if (batch.status === 'harvested') {
      throw new AlreadyHarvestedError(batch.harvestQty ?? 0);
    }

    const loss = dec(batch.seedCost) + dec(batch.suppliesCost);

    return tx.growBatch.update({
      where: { id: batch.id },
      data: {
        status: 'harvested',
        harvestDate: new Date(),
        harvestQty: 0,
        // Убыток = всё, что вложили в партию. До этой правки убыток считался
        // как costPrice × количество, а costPrice не сохранялся при посадке —
        // поэтому «убыток 0 сум» стоял на экране при любых потерях.
        costPrice: 0,
        note: `${batch.note ? batch.note + ' | ' : ''}СПИСАНО, убыток ${loss.toFixed(0)} сум (${performedBy || 'Admin'})`,
      },
    });
  });
}
