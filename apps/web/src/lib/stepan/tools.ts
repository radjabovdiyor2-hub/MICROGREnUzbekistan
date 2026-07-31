import { prisma } from '@repo/database';
import { getSettings, setSettings } from '@/lib/settings/store';
import { SETTINGS, type SettingDef } from '@/lib/settings/registry';
import { officeFetch } from '@/lib/office/client';

// ══════════════════════════════════════════════════════════════════════
// Инструменты Стёпана — то, чем он может пользоваться в админке.
//
// Разделение принципиальное:
//
//   ЧТЕНИЕ  — выполняется сразу, в цикле рассуждения. Ошибиться нельзя:
//             ничего не меняется.
//   ЗАПИСЬ  — НЕ выполняется. Стёпан только описывает намерение, оно
//             уходит владельцу карточкой с «было → стало», и лишь после
//             явного подтверждения попадает в execute().
//
// Поэтому executor у write-инструмента вызывается только из
// /api/admin/stepan/execute, никогда — из цикла чата.
// ══════════════════════════════════════════════════════════════════════

export interface ToolParam {
  type: 'string' | 'number' | 'boolean';
  description: string;
  enum?: string[];
}

export interface ReadTool {
  name: string;
  description: string;
  params: Record<string, ToolParam>;
  required?: string[];
  run: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface WriteTool {
  name: string;
  description: string;
  params: Record<string, ToolParam>;
  required?: string[];
  /** Человеческое описание намерения + «было → стало» для карточки. */
  preview: (args: Record<string, unknown>) => Promise<{
    summary: string;
    before?: string;
    after?: string;
    /** true — действие видно клиентам сразу (рассылка, цена на витрине). */
    risky?: boolean;
    error?: string;
  }>;
  execute: (args: Record<string, unknown>) => Promise<{ ok: boolean; message: string }>;
}

const money = (n: number) => `${Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ')} сум`;

// ─────────────────────────────── ЧТЕНИЕ ───────────────────────────────

export const READ_TOOLS: ReadTool[] = [
  {
    name: 'get_business_summary',
    description: 'Сводка за сегодня: онлайн-заказы, продажи в магазине (POS), выручка, новые клиенты.',
    params: {},
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
  {
    name: 'get_orders',
    description: 'Последние заказы, можно отфильтровать по статусу.',
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
    run: async () => getSettings(),
  },
  {
    name: 'get_tasks',
    description: 'Задачи отделов: что в работе, что просрочено.',
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

// ─────────────────────────────── ЗАПИСЬ ───────────────────────────────

export const WRITE_TOOLS: WriteTool[] = [
  {
    name: 'set_setting',
    description: 'Изменить бизнес-настройку (цена доставки, бонусы, пороги склада, тексты на сайте).',
    params: {
      key: { type: 'string', description: 'Ключ настройки, например delivery.fee' },
      value: { type: 'string', description: 'Новое значение' },
    },
    required: ['key', 'value'],
    preview: async (args) => {
      const key = String(args.key);
      const def = (SETTINGS as Record<string, SettingDef>)[key];
      if (!def) return { summary: `Неизвестная настройка «${key}»`, error: 'Такой настройки нет' };
      const current = (await getSettings())[key];
      return {
        summary: `Изменить настройку «${def.labelRu}»`,
        before: String(current),
        after: String(args.value),
        risky: def.category === 'delivery' || def.category === 'bonus' || def.category === 'payment',
      };
    },
    execute: async (args) => {
      const key = String(args.key);
      const { applied, errors } = await setSettings({ [key]: args.value }, 'stepan');
      if (errors[key]) return { ok: false, message: errors[key] };
      return { ok: true, message: `«${key}» теперь ${JSON.stringify(applied[key])}` };
    },
  },
  {
    name: 'change_product_price',
    description: 'Изменить цену товара. Нужен id товара — сначала найдите его через find_product.',
    params: {
      productId: { type: 'string', description: 'ID товара' },
      newPrice: { type: 'number', description: 'Новая цена в сумах' },
    },
    required: ['productId', 'newPrice'],
    preview: async (args) => {
      const product = await prisma.product.findUnique({
        where: { id: String(args.productId) },
        select: { nameRu: true, nameUz: true, price: true },
      });
      if (!product) return { summary: 'Товар не найден', error: 'Нет товара с таким id' };
      const next = Number(args.newPrice);
      if (!Number.isFinite(next) || next <= 0) {
        return { summary: 'Некорректная цена', error: 'Цена должна быть больше нуля' };
      }
      const diff = Math.round(((next - product.price) / product.price) * 100);
      return {
        summary: `Изменить цену «${product.nameRu || product.nameUz}» (${diff > 0 ? '+' : ''}${diff}%)`,
        before: money(product.price),
        after: money(next),
        risky: true, // цена сразу видна покупателям на витрине
      };
    },
    execute: async (args) => {
      const next = Math.round(Number(args.newPrice));
      const updated = await prisma.product.update({
        where: { id: String(args.productId) },
        data: { price: next },
        select: { nameRu: true, nameUz: true },
      });
      return { ok: true, message: `Цена «${updated.nameRu || updated.nameUz}» теперь ${money(next)}` };
    },
  },
  {
    name: 'create_task',
    description: 'Поставить задачу отделу. Бот отдела получит её через шину событий.',
    params: {
      department: {
        type: 'string', description: 'Отдел-исполнитель',
        enum: ['sales', 'support', 'finance', 'hr', 'marketing', 'analytics',
               'content', 'qa', 'rnd', 'devops', 'pm', 'operations', 'production', 'logistics'],
      },
      title: { type: 'string', description: 'Что нужно сделать' },
      priority: { type: 'string', description: 'Приоритет', enum: ['low', 'medium', 'high', 'urgent'] },
    },
    required: ['department', 'title'],
    preview: async (args) => ({
      summary: `Поставить задачу отделу «${args.department}»`,
      after: `${args.title} (приоритет: ${args.priority ?? 'medium'})`,
    }),
    execute: async (args) => {
      const department = String(args.department).toLowerCase();
      const task = await prisma.task.create({
        data: {
          title: String(args.title).slice(0, 500),
          department,
          priority: String(args.priority ?? 'medium'),
          status: 'todo',
        },
      });
      const dispatch = await officeFetch('/api/admin/dispatch-task', {
        method: 'POST',
        body: JSON.stringify({
          task_id: task.id, title: task.title, department,
          priority: task.priority, description: '',
        }),
      });
      return {
        ok: true,
        message: dispatch.ok
          ? `Задача #${task.id} поставлена отделу «${department}»`
          : `Задача #${task.id} сохранена, но бот не уведомлён: ${dispatch.error}`,
      };
    },
  },
  {
    name: 'dispatch_bot_action',
    description: 'Запустить задачу бота: бекап базы, снимок KPI, синк метрик Instagram, аудит лидов.',
    params: {
      action: {
        type: 'string', description: 'Что запустить',
        enum: ['daily_backup', 'daily_kpi_snapshot', 'sync_publication_metrics',
               'force_learning_cycle', 'trigger_lead_audit'],
      },
    },
    required: ['action'],
    preview: async (args) => ({
      summary: `Запустить «${args.action}» в ИИ-офисе`,
      after: 'Задача уйдёт боту немедленно',
    }),
    execute: async (args) => {
      const res = await officeFetch<{ status: string; result?: unknown; bot?: string }>(
        '/api/admin/bot-action',
        { method: 'POST', body: JSON.stringify({ action: String(args.action), bot: 'auto' }), timeoutMs: 100_000 },
      );
      if (!res.ok) return { ok: false, message: res.error ?? 'ИИ-офис недоступен' };
      if (res.data?.status === 'pending') {
        return { ok: true, message: 'Задача поставлена, бот пока не ответил' };
      }
      return { ok: true, message: `Выполнено ботом ${res.data?.bot ?? '—'}` };
    },
  },
  {
    name: 'toggle_bot_job',
    description: 'Включить или выключить фоновую задачу бота по расписанию.',
    params: {
      bot: { type: 'string', description: 'Имя бота, например finance_bot' },
      name: { type: 'string', description: 'Имя задачи, например daily_finance_report' },
      enabled: { type: 'boolean', description: 'true — включить, false — выключить' },
    },
    required: ['bot', 'name', 'enabled'],
    preview: async (args) => ({
      summary: `${args.enabled ? 'Включить' : 'Выключить'} задачу «${args.name}» у ${args.bot}`,
      before: args.enabled ? 'выключена' : 'включена',
      after: args.enabled ? 'включена' : 'выключена',
    }),
    execute: async (args) => {
      const res = await officeFetch('/api/admin/bot-jobs', {
        method: 'POST',
        body: JSON.stringify({ bot: args.bot, name: args.name, enabled: !!args.enabled }),
      });
      return res.ok
        ? { ok: true, message: `Задача «${args.name}» ${args.enabled ? 'включена' : 'выключена'}` }
        : { ok: false, message: res.error ?? 'Не удалось изменить расписание' };
    },
  },
  {
    name: 'update_order_status',
    description: 'Изменить статус заказа. Клиенту уйдёт уведомление в Telegram.',
    params: {
      orderId: { type: 'string', description: 'ID заказа' },
      status: {
        type: 'string', description: 'Новый статус',
        enum: ['PENDING', 'CONFIRMED', 'PREPARING', 'DELIVERING', 'DELIVERED', 'CANCELLED'],
      },
    },
    required: ['orderId', 'status'],
    preview: async (args) => {
      const order = await prisma.order.findUnique({
        where: { id: String(args.orderId) },
        select: { orderNumber: true, status: true, total: true },
      });
      if (!order) return { summary: 'Заказ не найден', error: 'Нет заказа с таким id' };
      return {
        summary: `Заказ ${order.orderNumber} на ${money(order.total)}`,
        before: order.status,
        after: String(args.status),
        risky: true, // клиент получит уведомление
      };
    },
    execute: async (args) => {
      const { syncOrderStatus } = await import('@/lib/orderSync');
      const updated = await prisma.order.update({
        where: { id: String(args.orderId) },
        data: { status: String(args.status) as never },
        // user обязателен: syncOrderStatus шлёт уведомление по
        // order.user.telegramId и молча ничего не делает без этой связи.
        include: { user: { select: { telegramId: true, language: true } } },
      });
      await syncOrderStatus(updated).catch(err => console.error('[stepan] syncOrderStatus:', err));
      return { ok: true, message: `Заказ ${updated.orderNumber}: статус ${updated.status}` };
    },
  },
  {
    name: 'deactivate_learning',
    description: 'Отключить вредный вывод петли самообучения, чтобы бот перестал его применять.',
    params: { id: { type: 'number', description: 'ID вывода' } },
    required: ['id'],
    preview: async (args) => {
      const learning = await prisma.botLearning.findUnique({ where: { id: Number(args.id) } });
      if (!learning) return { summary: 'Вывод не найден', error: 'Нет вывода с таким id' };
      return {
        summary: `Отключить вывод ${learning.bot} / ${learning.metric}`,
        before: learning.inference.slice(0, 200),
        after: 'бот перестанет применять эти параметры',
      };
    },
    execute: async (args) => {
      const updated = await prisma.botLearning.update({
        where: { id: Number(args.id) },
        data: { isActive: false },
      });
      return { ok: true, message: `Вывод ${updated.bot}/${updated.metric} отключён` };
    },
  },
];

export const READ_BY_NAME = new Map(READ_TOOLS.map(t => [t.name, t]));
export const WRITE_BY_NAME = new Map(WRITE_TOOLS.map(t => [t.name, t]));

/** Описание инструментов в формате JSON Schema — для OpenAI и Gemini. */
export function toolSchemas() {
  const build = (t: ReadTool | WriteTool) => ({
    name: t.name,
    description: t.description,
    parameters: {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(t.params).map(([k, p]) => [
          k,
          { type: p.type, description: p.description, ...(p.enum ? { enum: p.enum } : {}) },
        ]),
      ),
      required: t.required ?? [],
    },
  });
  return [...READ_TOOLS.map(build), ...WRITE_TOOLS.map(build)];
}
