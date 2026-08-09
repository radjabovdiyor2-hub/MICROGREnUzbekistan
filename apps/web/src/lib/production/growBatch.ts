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

/**
 * «10 лотков» или «250 стаканчиков» — как назвать количество посадки.
 *
 * Единица зависит от культуры: микрозелень растят в лотках, салаты — поштучно
 * в стаканчиках 63 мм. До этого слово «лотков» было вшито в текст движений
 * склада и в подписи, и партия салата описывалась лотками, которых нет.
 */
export function unitLabel(plantingUnit: string, quantity: number): string {
  return plantingUnit === 'cup' ? `${quantity} стаканч.` : `${quantity} лотк.`;
}

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

/**
 * Что и сколько уйдёт со склада на такую посадку — до её создания.
 *
 * `quantity` — число единиц посадки в тех единицах, что заданы в норме:
 * лотков для микрозелени, стаканчиков для салата.
 */
export async function plantingRequirements(cropType: string, quantity: number) {
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

  const brief = (m: { id: string; name: string; unit: string; stock: Prisma.Decimal; avgCost: Prisma.Decimal }) => ({
    id: m.id,
    name: m.name,
    unit: m.unit,
    stock: dec(m.stock),
    avgCost: dec(m.avgCost),
  });

  needs.push({
    material: seedMaterial ? brief(seedMaterial) : null,
    kind: 'SEED',
    required: dec(norm.seedPerUnit) * quantity,
    label: 'Семена',
  });

  // Расходники — по решению владельца входят в себестоимость наравне с
  // семенами. Норма не задана → статья просто не участвует, а не срывает
  // посадку: субстрат могли ещё не начать учитывать.
  //
  // Упаковки здесь НЕТ намеренно: упаковывают готовый урожай, а не посев.
  // Раньше она списывалась при посадке, и у погибшей партии упаковка
  // оказывалась потрачена зря — да ещё и входила в её убыток.
  // Теперь её списывает harvestBatch, по фактическому сбору.
  const substratePerUnit = dec(norm.substratePerUnit);
  if (substratePerUnit > 0) {
    needs.push({
      material: brief(await resolveSubstrate(norm)),
      kind: 'SUBSTRATE',
      required: substratePerUnit * quantity,
      label: 'Субстрат',
    });
  }

  const traysPerUnit = dec(norm.traysPerBatch);
  if (traysPerUnit > 0) {
    // Лотки остаются «первым активным»: тип один на всё производство, выбирать
    // тут не из чего. У субстратов иначе — их два и они не взаимозаменяемы.
    const tray = await prisma.rawMaterial.findFirst({
      where: { kind: 'TRAY', isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    needs.push({
      material: tray ? brief(tray) : null,
      kind: 'TRAY',
      required: traysPerUnit * quantity,
      label: 'Лотки',
    });
  }

  return { norm, needs };
}

/**
 * Какой субстрат списывать под эту культуру.
 *
 * Раньше здесь стоял `findFirst({ where: { kind: 'SUBSTRATE' } })` с сортировкой
 * по дате — то есть «самый старый активный». Пока субстрат был один, это
 * работало. Как только рядом с кокосом появляется агро вата, они становятся
 * для кода неразличимы: любая посадка — хоть редиса, хоть салата — списывает
 * тот, что заведён раньше. Ошибки не будет, остаток второго не сдвинется
 * никогда, а себестоимость окажется чужой.
 *
 * Поэтому: явная привязка в норме культуры. Не задана и субстрат ровно один —
 * берём его (прежнее поведение, ничего не ломаем). Не задана, а субстратов
 * несколько — отказываемся и просим выбрать, а не угадываем.
 */
async function resolveSubstrate(norm: { cropType: string; nameRu: string; substrateMaterialId: string | null }) {
  if (norm.substrateMaterialId) {
    const bound = await prisma.rawMaterial.findFirst({
      where: { id: norm.substrateMaterialId, isActive: true },
    });
    if (bound) return bound;
    throw new MissingDataError(
      ['substrateMaterial'],
      `У культуры «${norm.nameRu}» указан субстрат, которого больше нет в справочнике. ` +
        `Выберите другой в нормах культуры.`,
    );
  }

  const active = await prisma.rawMaterial.findMany({
    where: { kind: 'SUBSTRATE', isActive: true },
    orderBy: { createdAt: 'asc' },
    take: 2,
  });

  if (active.length === 1) return active[0];

  if (active.length === 0) {
    throw new MissingDataError(
      ['substrateMaterial'],
      `Норма культуры «${norm.nameRu}» требует субстрат, но на складе нет ни одного. ` +
        `Заведите его в разделе «Сырьё».`,
    );
  }

  throw new MissingDataError(
    ['substrateMaterial'],
    `Субстратов на складе несколько, а у культуры «${norm.nameRu}» не указано, какой её. ` +
      `Выберите субстрат в нормах культуры — иначе списался бы первый попавшийся.`,
  );
}

/** Посадить партию: списать сырьё и зафиксировать себестоимость. */
export async function plantBatch(input: PlantInput) {
  const quantity = Math.max(1, Math.floor(Number(input.trays) || 1));
  const seedDate = new Date(input.seedDate);
  if (Number.isNaN(seedDate.getTime())) throw new Error('Некорректная дата посева');

  const { norm, needs } = await plantingRequirements(input.cropType, quantity);
  const units = unitLabel(norm.plantingUnit, quantity);

  // Семена обязательны: без них посадки не существует. Нет карточки сырья —
  // это вопрос владельцу, а не повод записать посадку без себестоимости.
  const seed = needs.find((n) => n.kind === 'SEED')!;
  if (!seed.material) {
    throw new MissingDataError(
      ['seedMaterial'],
      `Семян «${norm.nameRu}» нет на складе сырья. Заведите их и укажите приход — ` +
        `тогда посадка спишет нужные ${seed.required} ${norm.seedUnit === 'pcs' ? 'шт' : 'г'} ` +
        `и посчитает себестоимость.`,
    );
  }

  return prisma.$transaction(async (tx) => {
    const batch = await tx.growBatch.create({
      data: {
        cropType: input.cropType,
        trays: quantity,
        seedDate,
        darkDays: norm.darkDays,
        lightDays: norm.lightDays,
        shelfDays: norm.shelfDays,
        status: 'dark',
        note: input.note ? String(input.note).slice(0, 1000) : null,
        productId: input.productId || null,
        productName: input.productName || null,
        plannedYield: norm.yieldPerUnit
          ? new Prisma.Decimal(dec(norm.yieldPerUnit) * quantity)
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
        reason: `Посадка ${norm.nameRu} — ${units}`,
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

    // Упаковка списывается ЗДЕСЬ, а не при посадке: упаковывают готовый
    // урожай. У погибшей партии упаковка теперь не тратится вовсе.
    // Норма задана на единицу посадки, поэтому считаем от их числа.
    const norm = await tx.cropNorm.findUnique({ where: { cropType: batch.cropType } });
    let packagingCost = 0;
    const packagingNeeded = dec(norm?.packagingPerUnit) * batch.trays;
    const batchUnits = unitLabel(norm?.plantingUnit ?? 'tray', batch.trays);

    if (packagingNeeded > 0) {
      const packaging = await tx.rawMaterial.findFirst({
        where: { kind: 'PACKAGING', isActive: true },
        orderBy: { createdAt: 'asc' },
      });
      if (packaging) {
        // Не хватило упаковки — сбор всё равно проходит: урожай уже снят,
        // отказ здесь только заставил бы вводить его заново. Себестоимость
        // окажется занижена, и это видно по нулевой строке упаковки.
        try {
          const spent = await consumeMaterial(tx, {
            materialId: packaging.id,
            quantity: packagingNeeded,
            growBatchId: batch.id,
            reason: `Упаковка урожая — ${batchUnits}`,
            performedBy: input.performedBy,
          });
          packagingCost = spent.cost;
        } catch (err) {
          if (!(err instanceof NotEnoughMaterialError)) throw err;
          console.error('Упаковки не хватило, урожай оприходован без неё:', err.message);
        }
      }
    }

    const batchCost = dec(batch.seedCost) + dec(batch.suppliesCost) + packagingCost;
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
          note: `${batch.cropType}, ${batchUnits}, посев ${batch.seedDate.toISOString().slice(0, 10)}`,
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
        // Упаковка списана при сборе — дописываем её к расходникам партии,
        // иначе её стоимость осталась бы только в себестоимости единицы,
        // а в самой партии потерялась.
        suppliesCost: new Prisma.Decimal(
          (dec(batch.suppliesCost) + packagingCost).toFixed(2),
        ),
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
