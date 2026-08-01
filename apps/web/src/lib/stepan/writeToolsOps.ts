// Вынесено из tools.ts: реестр перерос 200 строк.
// Собирается обратно там же — карты имён и схемы остались в tools.ts.

import { prisma } from '@repo/database';
import { officeFetch } from '@/lib/office/client';
import { money, type WriteTool } from './toolTypes';

/** Управление ботами, статусами заказов и выводами офиса. */
export const WRITE_TOOLS_OPS: WriteTool[] = [
  {
    name: 'dispatch_bot_action',
    description: 'Запустить задачу бота: бекап базы, снимок KPI, синк метрик Instagram, аудит лидов.',
    runtimes: ['web', 'tg'],
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
    runtimes: ['web', 'tg'],
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
    runtimes: ['web', 'tg'],
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
    runtimes: ['web', 'tg'],
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
