// Вынесено из tools.ts: реестр перерос 200 строк.
// Собирается обратно там же — карты имён и схемы остались в tools.ts.

import { prisma } from '@repo/database';
import { getSettings, setSettings } from '@/lib/settings/store';
import { SETTINGS, type SettingDef } from '@/lib/settings/registry';
import { officeFetch } from '@/lib/office/client';
import { money, type WriteTool } from './toolTypes';

/** Настройки, цены и задачи. */
export const WRITE_TOOLS_CORE: WriteTool[] = [
  {
    name: 'set_setting',
    description: 'Изменить бизнес-настройку (цена доставки, бонусы, пороги склада, тексты на сайте).',
    runtimes: ['web', 'tg'],
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
    runtimes: ['web', 'tg'],
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
    runtimes: ['web', 'tg'],
    params: {
      department: {
        type: 'string', description: 'Отдел-исполнитель',
        enum: ['sales', 'support', 'finance', 'hr', 'marketing', 'analytics',
               'content', 'rnd', 'devops', 'pm', 'operations', 'production', 'logistics'],
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
];
