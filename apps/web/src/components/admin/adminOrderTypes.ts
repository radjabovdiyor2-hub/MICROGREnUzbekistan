// Типы заказа админки. Вынесены из AdminOrders: их делит с ним карточка
// заказа (AdminOrderDetail), а импорт типа из компонента тянул бы за собой
// весь его код.

export interface OrderItem {
  id: string;
  quantity: number;
  price: number;
  product: { nameUz: string; nameRu: string };
}

export interface Order {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  subtotal: number;
  deliveryFee: number;
  phone: string;
  address: string;
  note: string | null;
  paymentMethod: string;
  paymentStatus: string;
  createdAt: string;
  user: { firstName: string | null; phone: string | null };
  items: OrderItem[];
}
