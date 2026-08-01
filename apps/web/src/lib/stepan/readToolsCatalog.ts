// Вынесено из tools.ts: реестр перерос 200 строк.
// Собирается обратно там же — карты имён и схемы остались в tools.ts.

import { prisma } from '@repo/database';
import { getSettings } from '@/lib/settings/store';
import { type ReadTool } from './toolTypes';

/** Заказы, настройки, задачи и поиск по каталогу. */
export const READ_TOOLS_CATALOG: ReadTool[] = [
  {
    name: 'get_orders',
    description: 'Последние заказы, можно отфильтровать по статусу.',
    runtimes: ['web', 'tg'],
    params: {
      status: {
        type: 'string', description: 'Статус заказа',
        enum: ['PENDING', 'CONFIRMED', 'PREPARING', 'DELIVERING', 'DELIVERED', 'CANCELLED'],
      },
      limit: { type: 'number', description: 'Сколько вернуть, по умолчанию 20' },
    },
    run: async (args) => {
      const orders = await prisma.order.findMany({
        where: args.status ? { status: String(args.status) as never } : {},
        orderBy: { createdAt: 'desc' },
        take: Math.min(Number(args.limit) || 20, 50),
        select: {
          id: true, orderNumber: true, status: true, total: true,
          createdAt: true, phone: true, city: true,
          // Имя лежит у пользователя: в самом заказе его нет.
          user: { select: { firstName: true, lastName: true } },
        },
      });
      return orders.map(o => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        total: o.total,
        createdAt: o.createdAt,
        phone: o.phone,
        city: o.city,
        customer: [o.user?.firstName, o.user?.lastName].filter(Boolean).join(' ') || '—',
      }));
    },
  },
  {
    name: 'get_settings',
    description: 'Текущие бизнес-настройки: доставка, бонусы, пороги склада, контакты.',
    params: {},
    runtimes: ['web', 'tg'],
    run: async () => getSettings(),
  },
  {
    name: 'get_tasks',
    description: 'Задачи отделов: что в работе, что просрочено.',
    runtimes: ['web', 'tg'],
    params: { department: { type: 'string', description: 'Фильтр по отделу' } },
    run: async (args) => {
      const tasks = await prisma.task.findMany({
        where: {
          status: { notIn: ['done', 'cancelled'] },
          ...(args.department ? { department: String(args.department).toLowerCase() } : {}),
        },
        orderBy: [{ deadline: 'asc' }, { id: 'desc' }],
        take: 30,
      });
      const today = new Date();
      return tasks.map(t => ({
        id: t.id, title: t.title, department: t.department,
        status: t.status, priority: t.priority,
        deadline: t.deadline ? t.deadline.toISOString().slice(0, 10) : null,
        overdue: !!t.deadline && t.deadline < today,
      }));
    },
  },
  {
    name: 'find_product',
    description: 'Найти товар по названию, чтобы узнать его id, цену и остаток.',
    runtimes: ['web', 'tg'],
    params: { query: { type: 'string', description: 'Часть названия товара' } },
    required: ['query'],
    run: async (args) => {
      const q = String(args.query ?? '').trim();
      if (!q) return { error: 'Пустой запрос' };
      const products = await prisma.product.findMany({
        where: {
          OR: [
            { nameRu: { contains: q, mode: 'insensitive' } },
            { nameUz: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 10,
        select: { id: true, nameRu: true, nameUz: true, price: true, stock: true, isActive: true },
      });
      return products;
    },
  },
];
