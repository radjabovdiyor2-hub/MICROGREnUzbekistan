import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════════════
// Досылка заказов витрины в CRM офиса — разовая сверка после починки моста.
//
// ЗАЧЕМ
//
// 18.08.2026 выяснилось, что на проде пуст `INGEST_SECRET`. Офис при
// `ENVIRONMENT=production` отвечает на пустой секрет отказом ВСЕМ
// (`_check_ingest_secret`), поэтому каждый `/ingest/order` возвращал 401.
// Витрина эту ошибку гасит намеренно — падение офиса не должно срывать
// покупателю заказ, — и заказы жили только на сайте. Ни Стёпан, ни финансы,
// ни аналитика их не видели.
//
// Секрет починен, но прошлое само не догонит: `/ingest/order` вызывается
// один раз, в момент оформления. Этот скрипт находит расхождение и досылает
// недостающее.
//
// ИДЕМПОТЕНТНОСТЬ — ДАРОВАЯ
//
// Зеркало узнаёт дубль по маркеру `[webapp:<номер>]` в `crm_orders.notes`
// (web_office/main.py) и отвечает `{"status": "duplicate"}`. Повторный
// запуск ничего не испортит, поэтому скрипт можно гонять сколько угодно.
//
// ДАТА ОБЯЗАТЕЛЬНА
//
// Без `created_at` зеркало ставит `NOW()`, и вся история заказов легла бы
// в CRM одним сегодняшним днём — выручка офиса разошлась бы с витриной
// ровно так же, как разошлась бы история продаж без `sold_at`.
//
//   npx tsx prisma/backfill-crm-orders.ts            # досылка
//   npx tsx prisma/backfill-crm-orders.ts --dry-run  # только показать
// ══════════════════════════════════════════════════════════════════════

const DRY_RUN = process.argv.includes('--dry-run');

/** Куда слать. Тот же адрес, что у витрины (lib/orders/notify.ts). */
const INGEST_URL = process.env.OFFICE_INGEST_URL || 'http://web_office:8050/ingest/order';
const INGEST_SECRET = process.env.INGEST_SECRET || '';

/** Пауза между отправками: зеркало пишет в ту же базу, что и мы читаем. */
const PAUSE_MS = 150;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  if (!INGEST_SECRET) {
    // Без секрета офис ответит 401 на каждый заказ, и скрипт «отработает»
    // с нулевым результатом. Лучше сказать сразу.
    throw new Error(
      'INGEST_SECRET пуст — офис отклонит все запросы. Задайте переменную окружения.',
    );
  }

  // Заказы витрины и номера, уже перенесённые в CRM. Сверяем в памяти:
  // таблицы в одной базе, но `crm_orders.order_number` может быть пустым у
  // строк, заведённых офисом самостоятельно, — надёжнее маркер в notes.
  const [orders, mirrored] = await Promise.all([
    prisma.order.findMany({
      include: {
        user: { select: { id: true, firstName: true, lastName: true, telegramId: true, bonusPoints: true } },
        items: { include: { product: { select: { nameUz: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.crmOrder.findMany({ select: { notes: true, orderNumber: true } }),
  ]);

  const seen = new Set<string>();
  for (const row of mirrored) {
    if (row.orderNumber) seen.add(row.orderNumber);
    const marker = row.notes?.match(/\[webapp:([^\]]+)\]/);
    if (marker) seen.add(marker[1]);
  }

  const missing = orders.filter((o) => !seen.has(o.orderNumber));

  console.log(`Заказов на витрине: ${orders.length}`);
  console.log(`Из них есть в CRM: ${orders.length - missing.length}`);
  console.log(`Не доехало: ${missing.length}`);

  if (missing.length === 0) {
    console.log('Расхождения нет — досылать нечего.');
    return;
  }

  if (DRY_RUN) {
    for (const order of missing.slice(0, 20)) {
      console.log(`  ${order.orderNumber}  ${order.createdAt.toISOString().slice(0, 10)}  ${order.total}`);
    }
    if (missing.length > 20) console.log(`  … и ещё ${missing.length - 20}`);
    console.log('Пробный прогон: ничего не отправлено.');
    return;
  }

  let sent = 0;
  let duplicate = 0;
  const failed: { number: string; reason: string }[] = [];

  for (const order of missing) {
    // Тело — ровно то, что шлёт витрина в lib/orders/notify.ts#notifyOffice.
    // Форму здесь не изобретаем: разойдясь, она сломала бы разбор в офисе.
    const name = [order.user.firstName, order.user.lastName].filter(Boolean).join(' ') || null;
    const payload = {
      order_number: order.orderNumber,
      customer: {
        name,
        phone: order.phone,
        telegram_id: order.user.telegramId ? order.user.telegramId.toString() : null,
        bonus_balance: order.user.bonusPoints,
        web_user_id: order.user.id,
      },
      total_amount: order.total,
      // Деловая дата заказа. Без неё зеркало поставит NOW(), и вся история
      // сложится в один день.
      created_at: order.createdAt.toISOString(),
      delivery_fee: order.deliveryFee,
      discount_amount: order.discount,
      payment_method: order.paymentMethod,
      delivery_address: order.address,
      city: order.city,
      items_summary: order.items.map((i) => `${i.product.nameUz} x${i.quantity}`).join(', '),
      items: order.items.map((i) => ({
        storefront_id: i.productId,
        name: i.product.nameUz,
        quantity: Number(i.quantity),
        price: i.price,
      })),
      notes: order.note || '',
    };

    try {
      const res = await fetch(INGEST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Ingest-Secret': INGEST_SECRET },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });
      const body = (await res.json().catch(() => null)) as { status?: string; error?: string } | null;

      if (!res.ok) {
        failed.push({ number: order.orderNumber, reason: body?.error || `HTTP ${res.status}` });
      } else if (body?.status === 'duplicate') {
        duplicate += 1;
      } else {
        sent += 1;
      }
    } catch (err) {
      failed.push({ number: order.orderNumber, reason: err instanceof Error ? err.message : String(err) });
    }

    await sleep(PAUSE_MS);
  }

  console.log(`Дослано: ${sent}, уже было: ${duplicate}, отвергнуто: ${failed.length}`);
  for (const f of failed.slice(0, 20)) console.log(`  ✗ ${f.number}: ${f.reason}`);
  if (failed.length > 20) console.log(`  … и ещё ${failed.length - 20}`);
  if (failed.length > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
