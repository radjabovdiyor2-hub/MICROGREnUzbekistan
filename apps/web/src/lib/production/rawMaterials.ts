import { prisma, Prisma } from '@repo/database';
import { weightedAverageCost } from './weightedAverage';

// ══════════════════════════════════════════════════════════════════════
// Склад сырья: семена, субстрат, лотки, упаковка.
//
// ЗАЧЕМ. Учёта сырья в системе не было вообще. Поставщик был телефонной
// книгой без прайсов, семена нигде не числились, а себестоимость товара
// бралась из последней закупки готовой продукции — то есть для выращенного
// самими не бралась ниоткуда.
//
// СЕБЕСТОИМОСТЬ — СРЕДНЕВЗВЕШЕННАЯ (решение владельца):
//
//     новая = (остаток × старая + приход × цена закупки) / (остаток + приход)
//
// Было 1 кг по 50 000, купили 1 кг по 70 000 → 60 000/кг. Цена не скачет
// вместе с рынком при каждой закупке, поэтому маржа считается от устойчивой
// величины, а не от последнего чека.
//
// Остаток `RawMaterial.stock` меняется ТОЛЬКО вместе с записью в журнал
// `raw_material_movements`, одной транзакцией и относительной операцией —
// ровно та ошибка, из-за которой у готового товара остатки разъезжались.
// ══════════════════════════════════════════════════════════════════════

const dec = (v: Prisma.Decimal | number | null | undefined): number =>
  v == null ? 0 : Number(v);

export interface ReceiptInput {
  materialId: string;
  quantity: number;
  unitCost: number;
  supplierId?: string | null;
  performedBy?: string | null;
  /** Оплата в долг → запись в «Долги» стороной «мы должны». */
  onCredit?: boolean;
  dueDate?: string | null;
  note?: string | null;
}

export interface ReceiptResult {
  materialId: string;
  name: string;
  unit: string;
  stock: number;
  avgCostBefore: number;
  avgCostAfter: number;
  totalCost: number;
}

/** Приход сырья от поставщика. Пересчитывает средневзвешенную цену. */
export async function receiveMaterial(input: ReceiptInput): Promise<ReceiptResult> {
  const quantity = Math.abs(Number(input.quantity));
  const unitCost = Math.max(0, Number(input.unitCost));
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('Количество прихода должно быть больше нуля');
  }

  return prisma.$transaction(async (tx) => {
    // Читаем ВНУТРИ транзакции: средняя цена зависит от текущего остатка,
    // и чтение до транзакции дало бы неверную среднюю при двух приходах разом.
    const material = await tx.rawMaterial.findUnique({ where: { id: input.materialId } });
    if (!material) throw new Error('Сырьё не найдено');

    const stockBefore = dec(material.stock);
    const avgBefore = dec(material.avgCost);
    const totalCost = quantity * unitCost;

    const stockAfter = stockBefore + quantity;
    const avgAfter = weightedAverageCost(stockBefore, avgBefore, quantity, unitCost);

    await tx.rawMaterial.update({
      where: { id: material.id },
      data: {
        stock: { increment: new Prisma.Decimal(quantity) },
        avgCost: new Prisma.Decimal(avgAfter.toFixed(2)),
      },
    });

    await tx.rawMaterialMovement.create({
      data: {
        materialId: material.id,
        type: 'IN',
        quantity: new Prisma.Decimal(quantity),
        unitCost: new Prisma.Decimal(unitCost.toFixed(2)),
        totalCost: new Prisma.Decimal(totalCost.toFixed(2)),
        supplierId: input.supplierId || null,
        reason: input.note || 'Приход от поставщика',
        performedBy: input.performedBy || 'Admin',
      },
    });

    // Взяли в долг — записываем сторону «мы должны». Раздел «Долги» до сих пор
    // знал только про долги клиентов, хотя тип WE_OWE в схеме был.
    if (input.onCredit && input.supplierId) {
      const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
      await tx.debt.create({
        data: {
          type: 'WE_OWE',
          personName: supplier?.name ?? 'Поставщик',
          phone: supplier?.phone ?? null,
          amount: Math.round(totalCost),
          paidAmount: 0,
          description: `Приход: ${material.name} × ${quantity} ${material.unit}`,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          supplierId: input.supplierId,
        },
      });
    }

    return {
      materialId: material.id,
      name: material.name,
      unit: material.unit,
      stock: stockAfter,
      avgCostBefore: avgBefore,
      avgCostAfter: Number(avgAfter.toFixed(2)),
      totalCost,
    };
  });
}

/** Сырьё, которого осталось меньше порога, — для предупреждений. */
export async function lowStockMaterials() {
  const materials = await prisma.rawMaterial.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });
  return materials
    .filter((m) => dec(m.minStock) > 0 && dec(m.stock) <= dec(m.minStock))
    .map((m) => ({
      id: m.id,
      name: m.name,
      kind: m.kind,
      unit: m.unit,
      stock: dec(m.stock),
      minStock: dec(m.minStock),
      avgCost: dec(m.avgCost),
    }));
}
