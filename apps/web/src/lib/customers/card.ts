import { prisma } from '@repo/database';

// ══════════════════════════════════════════════════════════════════════
// Карточка клиента для админки: контакты, история заказов, обращения.
//
// Истории заказов в разделе «Клиенты» не было вовсе — только счётчик
// «Заказов: 7», хотя шапка раздела обещала «Просмотр заказов». Данные при
// этом лежали рядом: через зеркало `/ingest/order` проходит КАЖДЫЙ заказ —
// и с сайта, и оформленный менеджером, — поэтому `crm_orders` по клиенту это
// полная картина, а не часть её.
//
// Форма ответа повторяет инструмент офиса `get_customer_orders`
// (shared/tools/crm.py): номер, дата, сумма, статус, позиции строками. Два
// представления одних и тех же данных должны читаться одинаково, иначе
// владелец в вебе и бот в Telegram начнут отвечать по-разному.
// ══════════════════════════════════════════════════════════════════════

/** Сколько последних заказов и обращений показываем в карточке. */
const ORDERS_LIMIT = 50;
const ACTIVITY_LIMIT = 30;

export interface CustomerCardOrder {
  id: number;
  orderNumber: string | null;
  createdAt: string;
  total: number;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  deliveryAddress: string | null;
  /** «Рукола × 2» — как это показывает бот офиса. */
  items: string[];
}

export interface CustomerCard {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  telegramId: string | null;
  telegramUsername: string | null;
  customerType: string;
  companyName: string | null;
  companyType: string | null;
  /** Аудитория заведения: female | male | mixed. null = не выяснено */
  audience: string | null;
  address: string | null;
  city: string;
  /** Slug района (districts.ts) */
  district: string | null;
  status: string;
  notes: string;
  source: string | null;
  createdAt: string;
  lastOrderDate: string | null;
  /** Счётчики из карточки CRM — их ведёт зеркало заказов. */
  ordersCount: number;
  totalSpent: number;
  bonusBalance: number;
  /** Аккаунт витрины, которому принадлежат бонусы. null — связки нет. */
  webAccount: { id: string; phone: string | null; bonusPoints: number } | null;
  orders: CustomerCardOrder[];
  interactions: {
    id: number;
    createdAt: string;
    channel: string;
    type: string;
    botName: string | null;
    summary: string | null;
    resolved: boolean;
  }[];
  followups: {
    id: number;
    scheduledAt: string;
    message: string;
    status: string;
  }[];
}

/** Позиция заказа одной строкой. `× 2` без хвоста `.00` у целых количеств. */
function itemLine(item: {
  quantity: unknown;
  unit: string;
  product: { nameRu: string; nameUz: string };
}): string {
  const qty = Number(item.quantity);
  const name = item.product.nameRu || item.product.nameUz;
  return `${name} × ${Number.isInteger(qty) ? qty : qty.toFixed(2)} ${item.unit}`.trim();
}

/** Карточка клиента целиком. null — клиента с таким id нет. */
export async function getCustomerCard(id: number): Promise<CustomerCard | null> {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      crmOrders: {
        orderBy: { createdAt: 'desc' },
        take: ORDERS_LIMIT,
        include: {
          items: {
            include: { product: { select: { nameRu: true, nameUz: true } } },
          },
        },
      },
      interactions: {
        orderBy: { createdAt: 'desc' },
        take: ACTIVITY_LIMIT,
      },
      followups: {
        orderBy: { scheduledAt: 'desc' },
        take: ACTIVITY_LIMIT,
      },
    },
  });

  if (!customer) return null;

  // Аккаунт витрины отдельным запросом: `web_user_id` — обычная колонка, а не
  // объявленная связь Prisma (карточка CRM живёт своей жизнью и может быть
  // не связана ни с кем). Именно на этом аккаунте лежат бонусы, которыми
  // клиент расплачивается в корзине.
  const webAccount = customer.webUserId
    ? await prisma.user.findUnique({
        where: { id: customer.webUserId },
        select: { id: true, phone: true, bonusPoints: true },
      })
    : null;

  return {
    id: customer.id,
    name: customer.name || '—',
    phone: customer.phone || '—',
    email: customer.email,
    telegramId: customer.telegramId ? customer.telegramId.toString() : null,
    telegramUsername: customer.telegramUsername,
    customerType: customer.customerType,
    companyName: customer.companyName,
    companyType: customer.companyType,
    audience: customer.audience,
    address: customer.address,
    city: customer.city,
    district: customer.district,
    status: customer.status,
    notes: customer.notes || '',
    source: customer.source,
    createdAt: customer.createdAt.toISOString(),
    lastOrderDate: customer.lastOrderDate ? customer.lastOrderDate.toISOString() : null,
    ordersCount: customer.ordersCount,
    totalSpent: Number(customer.totalSpent || 0),
    bonusBalance: Number(customer.bonusBalance || 0),
    webAccount,
    orders: customer.crmOrders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      createdAt: o.createdAt.toISOString(),
      total: Number(o.totalAmount || 0),
      status: o.status,
      paymentStatus: o.paymentStatus,
      paymentMethod: o.paymentMethod,
      deliveryAddress: o.deliveryAddress,
      items: o.items.map(itemLine),
    })),
    interactions: customer.interactions.map((i) => ({
      id: i.id,
      createdAt: i.createdAt.toISOString(),
      channel: i.channel,
      type: i.interactionType,
      botName: i.botName,
      summary: i.summary,
      resolved: i.resolved,
    })),
    followups: customer.followups.map((f) => ({
      id: f.id,
      scheduledAt: f.scheduledAt.toISOString(),
      message: f.message,
      status: f.status,
    })),
  };
}
