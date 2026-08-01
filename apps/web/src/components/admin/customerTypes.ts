export interface CustomerItem {
  id: number;
  name: string;
  phone: string;
  telegramUsername: string | null;
  customerType: string;
  companyName: string | null;
  city: string;
  status: string;
  totalSpent: number;
  bonusBalance: number;
  ordersCount: number;
  notes: string;
  createdAt: string;
}
