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

export const UNIT_OPTIONS = [
  { value: 'g', label: 'граммы' },
  { value: 'kg', label: 'килограммы' },
  { value: 'pcs', label: 'штуки' },
  { value: 'l', label: 'литры' },
];
