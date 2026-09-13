export interface RawMaterial {
  id: string;
  name: string;
  kind: 'SEED' | 'SUBSTRATE' | 'TRAY' | 'PACKAGING' | 'OTHER';
  unit: string;
  stock: number;
  /** Средневзвешенная себестоимость единицы. */
  avgCost: number;
  minStock: number;
  cropType: string | null;
  stockValue: number;
  isLow: boolean;
  /** false — позиция скрыта. Видна только при «показать скрытые». */
  isActive?: boolean;
  lastPrice: {
    price: number;
    unit: string;
    supplier: string;
    supplierId: string;
  } | null;
}

export const KIND_LABELS: Record<RawMaterial['kind'], { ru: string; uz: string }> = {
  SEED: { ru: 'Семена', uz: "Urug'lar" },
  SUBSTRATE: { ru: 'Субстрат', uz: 'Substrat' },
  TRAY: { ru: 'Лотки', uz: 'Lotoklar' },
  PACKAGING: { ru: 'Упаковка', uz: 'Qadoqlash' },
  OTHER: { ru: 'Прочее', uz: 'Boshqa' },
};

// ⚠️ Килограммов здесь намеренно нет.
//
// Нормы расхода заданы в тех же единицах, что и остаток (`seedPerUnit`,
// `substratePerUnit`), а пересчёта единиц в коде нет нигде: списание вычитает
// число как есть. Мешок в 1 кг при норме 480 г давал отказ «нужно 480 kg, на
// складе 1 kg» — по такому сообщению причину не понять.
//
// Сыпучее хранится в граммах. Килограммы можно ввести при ПРИХОДЕ — форма
// сама переведёт их в граммы и покажет результат до сохранения.
export const UNIT_OPTIONS = [
  { value: 'g', label: { ru: 'граммы', uz: 'gramm' } },
  { value: 'pcs', label: { ru: 'штуки', uz: 'dona' } },
  { value: 'l', label: { ru: 'литры', uz: 'litr' } },
];

/**
 * Типы сырья, у которых единица не выбирается, — теперь таких нет.
 *
 * Список жёстко ставил граммы семенам и субстрату. Это верно ровно для одного
 * способа выращивания: микрозелень в лотках на кокосе. Салаты растят поштучно
 * в стаканчиках 63 мм — там пробка агро ваты штука на стаканчик и семена
 * считаются штуками. Пока субстрат и семена были здесь, завести их в штуках
 * было НЕЛЬЗЯ ни при каких настройках.
 *
 * Единицу теперь выбирают явно, и она обязана совпадать с единицей нормы
 * культуры: пересчёта в коде нет нигде, списание вычитает число как есть.
 * Килограммов в UNIT_OPTIONS по-прежнему нет — они вводятся при приходе.
 */
export const BULK_KINDS: RawMaterial['kind'][] = [];
