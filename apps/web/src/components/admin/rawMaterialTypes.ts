export interface RawMaterial {
  id: string;
  name: string;
  kind: 'SEED' | 'SUBSTRATE' | 'TRAY' | 'PACKAGING' | 'OTHER';
  unit: string;
  stock: number;
  /** Средневзвешенная себестоимость единицы — по ней списывается посадка. */
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

export const KIND_LABELS: Record<RawMaterial['kind'], string> = {
  SEED: 'Семена',
  SUBSTRATE: 'Субстрат',
  TRAY: 'Лотки',
  PACKAGING: 'Упаковка',
  OTHER: 'Прочее',
};

// ⚠️ Килограммов здесь намеренно нет.
//
// Нормы расхода заданы в ГРАММАХ (`seedGramsPerTray`), а пересчёта единиц
// в коде нет нигде: списание вычитает число как есть. Мешок в 1 кг при норме
// 480 г давал отказ «нужно 480 kg, на складе 1 kg» — по такому сообщению
// причину не понять.
//
// Сыпучее хранится в граммах. Килограммы можно ввести при ПРИХОДЕ — форма
// сама переведёт их в граммы и покажет результат до сохранения.
export const UNIT_OPTIONS = [
  { value: 'g', label: 'граммы' },
  { value: 'pcs', label: 'штуки' },
  { value: 'l', label: 'литры' },
];

/** Типы сырья, которые меряются граммами: для них единица не выбирается. */
export const BULK_KINDS: RawMaterial['kind'][] = ['SEED', 'SUBSTRATE'];
