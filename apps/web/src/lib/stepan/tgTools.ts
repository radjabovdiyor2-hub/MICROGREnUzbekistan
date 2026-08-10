// Вынесено из tools.ts: реестр перерос 200 строк.
// Собирается обратно там же — карты имён и схемы остались в tools.ts.

import { officeFetch } from '@/lib/office/client';
import { money, type ReadTool, type WriteTool } from './toolTypes';

// ──────────────── TELEGRAM-ВОЗМОЖНОСТИ, ДОСТУПНЫЕ В ВЕБЕ ─────────────

/**
 * Инструменты, которые раньше жили только в Telegram (assistant.py).
 * Веб-реализация делегирует в ИИ-офис через officeFetch.
 */
export const TG_READ_TOOLS: ReadTool[] = [
  {
    name: 'get_content_status',
    description:
      'Статус публикаций на сегодня: что уже вышло, а что ещё по плану. ' +
      'Вызывай на вопросы «опубликовали ли», «когда выйдет», «какой статус публикаций».',
    params: {},
    runtimes: ['web', 'tg'],
    run: async () => {
      const res = await officeFetch<{ status: string; result?: { message?: string } }>(
        '/api/admin/bot-action',
        { method: 'POST', body: JSON.stringify({ action: 'get_status', bot: 'content_bot' }), timeoutMs: 30_000 },
      );
      if (!res.ok) return { error: res.error ?? 'ИИ-офис недоступен' };
      return { status: res.data?.result?.message ?? 'Нет данных о публикациях' };
    },
  },
  {
    name: 'show_published_post',
    description:
      'Показать опубликованный контент — текст и описание поста/сторис. ' +
      'Вызывай, когда просят показать, скинуть или глянуть публикацию.',
    params: { day: { type: 'string', description: 'Какой день: today, yesterday, last или YYYY-MM-DD' } },
    runtimes: ['web', 'tg'],
    run: async (args) => {
      const res = await officeFetch<{ status: string; result?: { message?: string; data?: { posts?: unknown[] } } }>(
        '/api/admin/bot-action',
        {
          method: 'POST',
          body: JSON.stringify({ action: 'get_last_post', bot: 'content_bot', params: { day: args.day ?? 'today' } }),
          timeoutMs: 30_000,
        },
      );
      if (!res.ok) return { error: res.error ?? 'ИИ-офис недоступен' };
      const result = res.data?.result ?? {};
      return {
        message: result.message ?? 'Нет данных',
        posts: result.data?.posts ?? [],
      };
    },
  },
  // ── Telegram-only инструменты: реализация только в Python ──
  {
    name: 'roll_call',
    description: 'Провести перекличку: все боты отозовутся в текущем Telegram-чате. В вебе недоступно.',
    params: { message: { type: 'string', description: 'Текст сообщения для переклички' } },
    runtimes: ['tg'],
    run: async () => ({ error: 'roll_call работает только в Telegram' }),
  },
  // get_report и query_db удалены из реестра.
  //
  // Здесь они были заглушками, которые на любой вызов отвечали «используйте
  // get_business_summary» — то есть занимали имя, ничего не делая. В Telegram
  // им отвечали рукописные SQL-отчёты по фиксированному списку видов запроса,
  // дублировавшие get_business_summary, get_finance_summary, get_pnl,
  // top_products, get_tasks и build_report. Одно имя — один владелец, и раз
  // владельца у этих двух нет, имён тоже быть не должно.
];

export const TG_WRITE_TOOLS: WriteTool[] = [
  {
    name: 'register_sale',
    description:
      'Зарегистрировать продажу в CRM: завести/найти клиента, создать заказ, учесть доход. ' +
      'Вызывай, когда руководитель сообщает о состоявшейся продаже.',
    runtimes: ['web', 'tg'],
    params: {
      customer_name: { type: 'string', description: 'Кому продали: ресторан, кафе, человек' },
      phone: { type: 'string', description: 'Телефон клиента, если назван' },
      items: {
        type: 'array',
        description: 'Позиции продажи — один заказ',
        items: {
          type: 'object',
          properties: {
            product: { type: 'string', description: 'Товар, как назвал менеджер' },
            quantity: {
              type: 'number',
              description:
                'Количество — ТОЛЬКО если названо. Не назвали — НЕ СТАВЬ 1 и не угадывай: ' +
                'пропусти поле, отдел продаж сам спросит у руководителя.',
            },
            unit_price: { type: 'number', description: 'Цена за единицу — только если названа явно' },
          },
          // quantity намеренно НЕ обязателен: пока он стоял в required, модель
          // дописывала единицу, лишь бы вызов прошёл валидацию, и продажа
          // записывалась на выдуманном числе.
          required: ['product'],
        },
      },
      customer_type: { type: 'string', enum: ['b2b', 'b2c'], description: 'Ресторан/кафе/отель → b2b' },
      payment_status: { type: 'string', enum: ['paid', 'pending'], description: 'Оплачено или ждём оплату' },
    },
    required: ['customer_name', 'items'],
    preview: async (args) => ({
      summary: `Зарегистрировать продажу для «${args.customer_name}»`,
      after: `${(args.items as Array<{ product: string }>)?.length ?? 0} позиций`,
      risky: true,
    }),
    execute: async (args) => {
      const res = await officeFetch<{ status: string; result?: { message?: string } }>(
        '/api/admin/bot-action',
        {
          method: 'POST',
          body: JSON.stringify({ action: 'register_sale', bot: 'sales_bot', params: args }),
          timeoutMs: 60_000,
        },
      );
      if (!res.ok) return { ok: false, message: res.error ?? 'Отдел продаж недоступен' };
      if (res.data?.status === 'error') return { ok: false, message: res.data?.result?.message ?? 'Ошибка' };
      return { ok: true, message: res.data?.result?.message ?? 'Продажа зарегистрирована' };
    },
  },
  {
    name: 'add_product',
    description:
      'Добавить новый товар в каталог — и в магазин, и в CRM. ' +
      'Вызывай ТОЛЬКО после явного одобрения руководителя.',
    runtimes: ['web', 'tg'],
    params: {
      name: { type: 'string', description: 'Название товара' },
      price: { type: 'number', description: 'Цена за единицу в сумах' },
      unit: { type: 'string', enum: ['piece', 'kg', 'g', 'pack', 'set'], description: 'Единица измерения' },
      category: {
        type: 'string',
        enum: ['microgreens', 'baby-leaf', 'salads', 'flowers', 'seeds', 'substrate', 'equipment', 'sets'],
        description: 'Категория каталога',
      },
      stock: { type: 'number', description: 'Остаток на складе, если известен' },
    },
    required: ['name', 'price'],
    preview: async (args) => ({
      summary: `Добавить товар «${args.name}» в каталог`,
      after: `${money(Number(args.price))}`,
    }),
    execute: async (args) => {
      const res = await officeFetch<{ status: string; result?: { message?: string } }>(
        '/api/admin/bot-action',
        {
          method: 'POST',
          body: JSON.stringify({ action: 'add_product', bot: 'sales_bot', params: args }),
          timeoutMs: 60_000,
        },
      );
      if (!res.ok) return { ok: false, message: res.error ?? 'Отдел продаж недоступен' };
      return { ok: true, message: res.data?.result?.message ?? `Товар «${args.name}» добавлен` };
    },
  },
];
