export interface CustomerItem {
  id: number;
  name: string;
  phone: string;
  telegramUsername: string | null;
  customerType: string;
  /** Тип заведения: restaurant | cafe | toyxona | fitness | … (companyTypes.ts) */
  companyType: string | null;
  /** Аудитория заведения: female | male | mixed. null = не выяснено */
  audience: string | null;
  companyName: string | null;
  city: string;
  /** Slug района (districts.ts). null — геокодер его не назвал */
  district: string | null;
  status: string;
  /** null — смотрит не владелец: суммы скрыты. */
  totalSpent: number | null;
  /** null — смотрит не владелец. */
  bonusBalance: number | null;
  ordersCount: number;
  notes: string;
  createdAt: string;
}
