// Вынесено из tools.ts: реестр перерос 200 строк.
// Собирается обратно там же — карты имён и схемы остались в tools.ts.

import { prisma } from '@repo/database';
import { getSettings } from '@/lib/settings/store';
import { officeFetch } from '@/lib/office/client';
import { type ReadTool } from './toolTypes';

/** Сводки: бизнес, склад, финансы, боты, обучения, расход на ИИ. */
export const READ_TOOLS_SUMMARY: ReadTool[] = [
  {
    name: 'get_business_summary',
    description: 'Сводка за сегодня: онлайн-заказы, продажи в магазине (POS), выручка, новые клиенты.',
    params: {},
    runtimes: ['web', 'tg'],
    run: async () => {
      const since = new Date();
      since.setHours(0, 0, 0, 0);

      const [orders, revenueAgg, posAgg, newUsers, pending] = await Promise.all([
        prisma.order.count({ where: { createdAt: { gte: since } } }),
        prisma.order.aggregate({
          where: { createdAt: { gte: since }, status: { not: 'CANCELLED' } },
          _sum: { total: true },
        }),
        prisma.stockMovement.aggregate({
          where: { createdAt: { gte: since }, type: 'OUT' },
          _sum: { quantity: true },
        }),
        prisma.user.count({ where: { createdAt: { gte: since } } }),
        prisma.order.count({ where: { status: 'PENDING' } }),
      ]);

      return {
        ordersToday: orders,
        revenueToday: Number(revenueAgg._sum.total ?? 0),
        posUnitsToday: Math.abs(Number(posAgg._sum.quantity ?? 0)),
        newCustomersToday: newUsers,
        pendingOrders: pending,
      };
    },
  },
  {
    name: 'get_inventory_status',
    description: 'Остатки на складе: что заканчивается и что в избытке. Пороги берутся из настроек.',
    params: { limit: { type: 'number', description: 'Сколько позиций вернуть, по умолчанию 20' } },
    runtimes: ['web', 'tg'],
    run: async (args) => {
      const limit = Math.min(Number(args.limit) || 20, 100);
      const s = await getSettings();
      const critical = Number(s['stock.criticalLevel']) || 2;

      const products = await prisma.product.findMany({
        where: { isActive: true },
        orderBy: { stock: 'asc' },
        take: limit,
        select: { id: true, nameRu: true, nameUz: true, stock: true, price: true },
      });

      return {
        criticalThreshold: critical,
        items: products.map(p => ({
          id: p.id,
          name: p.nameRu || p.nameUz,
          stock: p.stock,
          price: p.price,
          status: p.stock <= critical ? 'CRITICAL' : p.stock <= critical * 5 ? 'LOW' : 'OK',
        })),
      };
    },
  },
  {
    name: 'get_finance_summary',
    description: 'Доходы, расходы и прибыль за период. Считается по деловой дате операции.',
    params: { days: { type: 'number', description: 'Период в днях, по умолчанию 30' } },
    runtimes: ['web', 'tg'],
    run: async (args) => {
      const days = Math.min(Math.max(Number(args.days) || 30, 1), 365);
      const from = new Date();
      from.setDate(from.getDate() - days);

      const grouped = await prisma.finance.groupBy({
        by: ['type', 'category'],
        where: { date: { gte: from } },
        _sum: { amount: true },
      });

      let income = 0, expense = 0;
      const categories = grouped.map(g => {
        const total = Number(g._sum.amount ?? 0);
        if (g.type === 'income') income += total; else expense += total;
        return { type: g.type, category: g.category, total };
      });

      return {
        days, income, expense, profit: income - expense,
        marginPct: income > 0 ? Math.round(((income - expense) / income) * 1000) / 10 : 0,
        categories: categories.sort((a, b) => b.total - a.total).slice(0, 15),
      };
    },
  },
  {
    name: 'get_bot_health',
    description: 'Живы ли 13 ИИ-ботов, сколько у них ошибок и какая последняя.',
    params: {},
    runtimes: ['web', 'tg'],
    run: async () => {
      const res = await officeFetch<{ bots: unknown[]; alive: number; total: number }>('/api/admin/bots');
      if (!res.ok) return { error: res.error, hint: 'ИИ-офис недоступен — проверьте контейнер mg_web_office' };
      return res.data;
    },
  },
  {
    name: 'get_active_learnings',
    description: 'Активные выводы петель самообучения: что боты решили поменять в своём поведении.',
    params: { bot: { type: 'string', description: 'Фильтр по боту, например sales_bot' } },
    runtimes: ['web', 'tg'],
    run: async (args) => {
      const rows = await prisma.botLearning.findMany({
        where: { isActive: true, ...(args.bot ? { bot: String(args.bot) } : {}) },
        orderBy: { appliedAt: 'desc' },
        take: 20,
      });
      return rows.map(l => ({
        id: l.id, bot: l.bot, metric: l.metric,
        observation: l.observation, inference: l.inference,
        adjustment: l.adjustment, appliedAt: l.appliedAt,
      }));
    },
  },
  {
    name: 'get_ai_spend',
    description: 'Расходы на ИИ по ботам и остаток бюджета.',
    params: {},
    runtimes: ['web', 'tg'],
    run: async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const [byBot, monthAgg, s] = await Promise.all([
        prisma.aiUsage.groupBy({
          by: ['bot'], where: { createdAt: { gte: startOfMonth } }, _sum: { costUsd: true },
        }),
        prisma.aiUsage.aggregate({ where: { createdAt: { gte: startOfMonth } }, _sum: { costUsd: true } }),
        getSettings(),
      ]);

      return {
        monthUsd: Number(monthAgg._sum.costUsd ?? 0),
        monthlyBudgetUsd: Number(s['ai.monthlyBudgetUsd']),
        byBot: byBot.map(b => ({ bot: b.bot, usd: Number(b._sum.costUsd ?? 0) }))
          .sort((a, b) => b.usd - a.usd),
      };
    },
  },
];
